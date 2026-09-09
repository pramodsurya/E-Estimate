"""Headless XSLOPE bridge for E-Estimate bund stability simulation.

Reads one JSON request on stdin, runs the requested IS 7894 loading case
through xslope (steady finite-element seepage followed by a limit-equilibrium
circular search or finite-element strength-reduction analysis, and writes one
JSON response on stdout. Everything human-readable goes to stderr so stdout
stays a clean single-line protocol channel.

Supported cases in this first slice:
  - "construction"   IS 7894 Case I  — end of construction, u = 0 (total stress)
  - "steady-seepage" IS 7894 Case IV — reservoir full, steady seepage, d/s slope

The request carries the completed proposed bund, its assumed toe-support line,
and non-overlapping material polygons derived by the application. The bridge
writes those zones to XSLOPE's v21+ polygon sheet so casing, hearting, cut-off
trench, rock toe, graded toe filter and foundation retain separate properties.
Offsets are metres about the centre-line and elevations are RLs. Units are SI
(metres, kN, days for permeability).
"""

import contextlib
import importlib.metadata
import json
import os
import shutil
import sys
import tempfile
import time

# XSLOPE's seepage module imports matplotlib for optional plotting. The bridge
# never opens plots, so force its non-GUI backend in development and in the
# packaged Windows sidecar.
os.environ.setdefault("MPLBACKEND", "Agg")

import numpy as np
import openpyxl
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.validation import explain_validity

import xslope.fileio as fileio
import xslope.mesh as xmesh
import xslope.seep as xseep
from xslope.generators import generate_starting_circles
from xslope.search import run_lem_analysis

SCHEMA_VERSION = 1
BRIDGE_VERSION = 8
REQUIRED_MATERIAL_COUNT = 2  # at minimum: embankment fill and foundation
# All seven limit-equilibrium methods the installed XSLOPE implements; the
# renderer sends either these canonical names or legacy aliases for OMS.
METHOD_ALIASES = {
    "ordinary": "oms",
    "fellenius": "oms",
    "oms": "oms",
    "bishop": "bishop",
    "janbu": "janbu",
    "corps": "corps",
    "lowe": "lowe",
    "spencer": "spencer",
    "mprice": "mprice",
    "morgenstern-price": "mprice",
    "morgenstern_price": "mprice",
}
DEFAULT_FOUNDATION_THICKNESS_M = 10.0
DEFAULT_MESH_SIZE_M = 1.5

# IS 7894 case families (see BUND_SIMULATION_PLAN.md §4).
CASE_IDS = {
    "construction",
    "partial-pool",
    "drawdown-us",
    "drawdown-ds",
    "steady-seepage",
    "rainfall",
    "quake-seepage",
    "quake-full",
}
SEEPAGE_CASES = CASE_IDS - {"construction"}
# Sudden-drawdown families solved with XSLOPE's staged rapid-drawdown
# procedure: two steady seepage fields (BC set 1 = pre-drawdown, BC set 2 =
# post-drawdown) and the three-stage strength reduction inside the solver.
DRAWDOWN_CASES = {"drawdown-us", "drawdown-ds"}


def fail(run_id, message):
    json.dump(
        {
            "schemaVersion": SCHEMA_VERSION,
            "runId": run_id,
            "status": "error",
            "message": message,
            "warnings": [],
            "diagnostics": {},
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    sys.stdout.flush()
    sys.exit(0)


def _polyline(raw, label):
    pts = [(float(p[0]), float(p[1])) for p in raw]
    if len(pts) < 2:
        raise ValueError(f"{label} needs at least 2 points, got {len(pts)}")
    return pts


def _extend_to(line, x_left, x_right):
    """Extend a two-point-plus line horizontally at its end levels."""
    pts = list(line)
    if pts[0][0] > x_left + 1e-9:
        pts.insert(0, (x_left, pts[0][1]))
    if pts[-1][0] < x_right - 1e-9:
        pts.append((x_right, pts[-1][1]))
    return pts


def _offsets_at(line, x):
    xs = [p[0] for p in line]
    ys = [p[1] for p in line]
    return float(np.interp(x, xs, ys))


def _material_polygon_blocks(raw_blocks, material_count):
    """Validate renderer-built, non-overlapping polygon-sheet material zones."""
    if not raw_blocks:
        raise ValueError("geometry.materialPolygons needs at least one material zone")
    blocks = []
    for index, raw in enumerate(raw_blocks, start=1):
        coords = [(float(p[0]), float(p[1])) for p in (raw.get("points") or [])]
        if len(coords) >= 2 and coords[0] == coords[-1]:
            coords.pop()
        if len(coords) < 3:
            raise ValueError(f"material polygon {index} needs at least 3 vertices")
        try:
            material_index = int(raw.get("materialIndex"))
        except (TypeError, ValueError):
            raise ValueError(
                f"material polygon {index} has no valid zero-based materialIndex"
            ) from None
        if material_index < 0 or material_index >= material_count:
            raise ValueError(
                f"material polygon {index} references materialIndex {material_index}, "
                f"but the request has {material_count} material rows"
            )
        polygon = Polygon(coords)
        if polygon.is_empty or polygon.area <= 1e-8 or not polygon.is_valid:
            raise ValueError(
                f"material polygon {index} is invalid: {explain_validity(polygon)}"
            )
        blocks.append(
            {
                "coords": coords,
                "material_index": material_index,
                "role": str(raw.get("role") or "material"),
                "polygon": polygon,
            }
        )

    for first in range(len(blocks)):
        for second in range(first + 1, len(blocks)):
            overlap = blocks[first]["polygon"].intersection(blocks[second]["polygon"]).area
            if overlap > 1e-6:
                raise ValueError(
                    f"material polygons {first + 1} and {second + 1} overlap by "
                    f"{overlap:.6g} sq m"
                )
    domain = unary_union([block["polygon"] for block in blocks])
    if domain.geom_type != "Polygon":
        raise ValueError(
            "material polygons do not form one connected bund-and-foundation domain"
        )
    return blocks


def build_workbook(request, workdir):
    """Fill an xslope input template from the app's cross-section."""
    geometry = request["geometry"]
    embankment = _polyline(geometry["embankment"], "embankment outline")
    ground_raw = _polyline(geometry["ground"], "ground line")

    materials_in = request["materials"]
    if len(materials_in) < REQUIRED_MATERIAL_COUNT:
        raise ValueError(
            f"simulation needs {REQUIRED_MATERIAL_COUNT} material rows "
            f"(embankment fill, foundation), got {len(materials_in)}"
        )
    polygon_blocks = _material_polygon_blocks(
        geometry.get("materialPolygons"), len(materials_in)
    )

    controls = request.get("controls") or {}
    analysis_type = str(controls.get("analysisType") or "lem").lower()
    if analysis_type == "lem":
        method = METHOD_ALIASES.get(str(controls.get("method", "bishop")).lower())
        if not method:
            raise ValueError(
                f"unsupported LEM method {controls.get('method')!r}; "
                "use ordinary or bishop"
            )
        slices = int(controls.get("slices") or 40)
        if slices < 10 or slices > 500:
            raise ValueError("LEM slice count must be between 10 and 500")
    elif analysis_type == "fem-ssrm":
        method = "bishop"  # valid workbook value; not used for the FEM solve
        slices = 40
        mesh_size = float(controls.get("meshSizeM") or DEFAULT_MESH_SIZE_M)
        tolerance = float(controls.get("tolerance") or 0.02)
        max_iterations = int(controls.get("maxIterations") or 3000)
        if mesh_size <= 0:
            raise ValueError("FEM target mesh size must be greater than zero")
        if tolerance <= 0 or tolerance > 0.25:
            raise ValueError("FEM SSRM tolerance must be greater than 0 and at most 0.25")
        if max_iterations < 100 or max_iterations > 20000:
            raise ValueError("FEM maximum iterations must be between 100 and 20000")
    else:
        raise ValueError(
            f"unsupported analysis type {analysis_type!r}; use lem or fem-ssrm"
        )

    case = str(request.get("case"))
    if case not in CASE_IDS:
        raise ValueError(
            f"unsupported case {case!r}; use one of {sorted(CASE_IDS)}"
        )
    water = request.get("water") or {}
    reservoir_level = water.get("reservoirLevel")
    foundation_depth = float(
        water.get("foundationThicknessM", DEFAULT_FOUNDATION_THICKNESS_M) or DEFAULT_FOUNDATION_THICKNESS_M
    )
    seepage_used = case in SEEPAGE_CASES
    rapid = case in DRAWDOWN_CASES
    tail_level = water.get("tailWaterMax")
    min_tail_level = water.get("tailWaterMin")
    min_headwater = water.get("minHeadwater")
    rainfall_level = water.get("rainfallLevel")
    if seepage_used and reservoir_level is None:
        raise ValueError(f"case {case} needs water.reservoirLevel")
    if case == "drawdown-us" and min_headwater is None:
        raise ValueError("case drawdown-us needs water.minHeadwater")
    if case == "drawdown-ds" and (tail_level is None or min_tail_level is None):
        raise ValueError("case drawdown-ds needs water.tailWaterMax and water.tailWaterMin")
    if case == "rainfall" and rainfall_level is None:
        raise ValueError("case rainfall needs water.rainfallLevel")
    kh = float((request.get("loading") or {}).get("kh") or 0)
    if case in ("quake-seepage", "quake-full") and kh <= 0:
        raise ValueError(f"case {case} needs loading.kh greater than zero")

    ground_ys = [p[1] for p in ground_raw]
    emb_ys = [p[1] for p in embankment]
    ground_min = min(ground_ys)
    height = max(emb_ys) - min(emb_ys + ground_ys)
    # The renderer's assumed foundation already includes its analysis margins,
    # and the material polygons end at the same coordinates. Extending only the
    # boundary line here would place seepage BC points outside the mesh domain.
    ground = list(ground_raw)
    # The renderer already seats the proposed bund at its two assumed toes.
    # Do not close it against the restoration survey here: that was the source
    # of self-intersecting polygons when existing earth crossed the proposal.
    embankment_closed = list(embankment)
    for toe_index in (0, -1):
        toe_x, toe_y = embankment_closed[toe_index]
        support_y = _offsets_at(ground, toe_x)
        if abs(toe_y - support_y) > 1e-3:
            raise ValueError(
                f"proposed bund toe at x={toe_x:g} does not meet its assumed "
                f"foundation surface ({toe_y:g} versus {support_y:g})"
            )

    template = fileio.default_template_path()
    xlsx = os.path.join(workdir, "bund_model.xlsx")
    shutil.copyfile(template, xlsx)

    wb = openpyxl.load_workbook(xlsx)
    main = wb["main"]
    main["D8"] = "SI"
    main["D9"] = "day"
    main["D10"] = 9.81
    main["D11"] = 0
    main["D12"] = 0
    main["D13"] = float((request.get("loading") or {}).get("kh") or 0)
    main["D14"] = method
    main["D15"] = slices
    main["D19"] = float(controls.get("meshSizeM") or DEFAULT_MESH_SIZE_M)
    main["D23"] = "auto"

    mat = wb["mat"]

    # Locate the rapid-drawdown strength columns (d, psi) by their header text
    # instead of hard-coded positions, so a template legend shift cannot silently
    # write the drawdown envelope into the wrong cell.
    def mat_column(header):
        for row in range(1, 21):
            if (
                str(mat.cell(row=row, column=1).value or "").strip().lower() == "mat"
                and str(mat.cell(row=row, column=2).value or "").strip().lower() == "name"
            ):
                for col in range(1, mat.max_column + 1):
                    if (
                        str(mat.cell(row=row, column=col).value or "").strip().lower()
                        == header
                    ):
                        return col
                raise ValueError(
                    f"the 'mat' sheet has no '{header}' column — the bundled "
                    "XSLOPE template may be outdated"
                )
        raise ValueError("the 'mat' sheet has no header row")

    d_col = mat_column("d")
    psi_col = mat_column("psi")

    def write_material(row, mid, m, use_seepage):
        def num(key, default=0.0):
            v = m.get(key)
            try:
                return float(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        mat.cell(row=row, column=1, value=mid)
        mat.cell(row=row, column=2, value=str(m.get("name") or f"Material {mid}"))
        mat.cell(row=row, column=3, value=num("gamma"))
        mat.cell(row=row, column=4, value=num("gammaSat", num("gamma")))
        mat.cell(row=row, column=5, value="mc")
        mat.cell(row=row, column=6, value=num("cPrime"))
        mat.cell(row=row, column=7, value=num("phiPrime"))
        mat.cell(row=row, column=13, value=num("elasticModulusKpa"))
        mat.cell(row=row, column=14, value=num("poissonRatio"))
        mat.cell(row=row, column=15, value="seep" if use_seepage else "none")
        if use_seepage:
            # Conductivities arrive in m/s; the model's time unit is the day.
            kx = num("kx", 8.64e-4) * 86400.0
            ky = num("ky", num("kx", 8.64e-4)) * 86400.0
            mat.cell(row=row, column=33, value=max(kx, 1e-9))
            mat.cell(row=row, column=34, value=max(ky, 1e-9))
            mat.cell(row=row, column=36, value=0.0)
            mat.cell(row=row, column=37, value=num("kr0", 0.05))
            mat.cell(row=row, column=38, value=-abs(num("h0", 0.5)))
        # Staged rapid-drawdown envelope (d in kPa, psi in degrees) — read by
        # the solver only in Case III runs, harmless blanks otherwise.
        mat.cell(row=row, column=d_col, value=num("rapidD"))
        mat.cell(row=row, column=psi_col, value=num("rapidPsi"))

    for index, material in enumerate(materials_in, start=1):
        write_material(10 + index, index, material, case in SEEPAGE_CASES)

    # XSLOPE v21+ polygon sheet: Type row 5, Mat ID row 6, coordinates
    # from row 10, with one block every three columns. Multiple blocks may
    # share a Mat ID; this is how the casing tiles around a hearting zone
    # without either an overlapping lens or a self-touching polygon-with-hole.
    polygon_sheet = wb["polygon"]
    for index, block in enumerate(polygon_blocks):
        x_col = 1 + index * 3
        y_col = x_col + 1
        polygon_sheet.cell(row=4, column=x_col, value=f"Polygon #{index + 1}")
        polygon_sheet.cell(row=5, column=x_col, value="Type:")
        polygon_sheet.cell(row=5, column=y_col, value="material")
        polygon_sheet.cell(row=6, column=x_col, value="Mat ID:")
        polygon_sheet.cell(
            row=6, column=y_col, value=block["material_index"] + 1
        )
        polygon_sheet.cell(row=7, column=x_col, value=block["role"])
        polygon_sheet.cell(row=8, column=x_col, value="Size:")
        polygon_sheet.cell(row=9, column=x_col, value="x")
        polygon_sheet.cell(row=9, column=y_col, value="y")
        for point_index, (x, y) in enumerate(block["coords"]):
            polygon_sheet.cell(row=10 + point_index, column=x_col, value=x)
            polygon_sheet.cell(row=10 + point_index, column=y_col, value=y)

    # The loader refuses a deck with neither circles nor a non-circular surface,
    # so seed one deep generic circle; the geometry-derived starting set that
    # actually drives the search is generated after loading.
    circles_sheet = wb["circles"]
    top_rl = max(emb_ys)
    circles_sheet["A3"] = 1
    circles_sheet["B3"] = round((embankment_closed[0][0] + embankment_closed[-1][0]) / 2.0, 3)
    circles_sheet["C3"] = round(top_rl + height, 3)
    circles_sheet["D3"] = "Radius"
    circles_sheet["H3"] = round(height * 2.0 + foundation_depth, 3)

    seepage_used = False
    if case in SEEPAGE_CASES:
        seepage_used = True
        reservoir_level = float(reservoir_level)
        top_rl = max(point[1] for point in embankment_closed)
        us_crest_index = next(
            i for i, point in enumerate(embankment_closed) if abs(point[1] - top_rl) <= 1e-8
        )
        ds_crest_index = max(
            i for i, point in enumerate(embankment_closed) if abs(point[1] - top_rl) <= 1e-8
        )
        # Downstream boundary polyline: d/s face plus the ground beyond the toe.
        ds_pts = embankment_closed[ds_crest_index:] + [
            p for p in ground if p[0] > embankment_closed[-1][0] + 1e-9
        ]
        # Upstream boundary polyline: ground before the u/s toe plus the face.
        us_pts = [
            p for p in ground if p[0] < embankment_closed[0][0] - 1e-9
        ] + embankment_closed[: us_crest_index + 1]

        seep = wb["seep bc"]
        # Exit face: the d/s boundary above any tail/rainfall level — nodes on
        # it drain at atmospheric pressure.
        exit_pts = ds_pts
        for i, (x, y) in enumerate(exit_pts):
            seep.cell(row=5 + i, column=2, value=x)
            seep.cell(row=5 + i, column=3, value=y)
        # Block 1: the reservoir — a submerged-only face on the u/s boundary.
        seep["E3"] = "reservoir"
        seep["F3"] = reservoir_level
        for i, (x, y) in enumerate(us_pts):
            seep.cell(row=5 + i, column=5, value=x)
            seep.cell(row=5 + i, column=6, value=y)

        # Block 2 (H/I): tail water, or the sustained-rainfall saturation level
        # for Case V. The submerged-only "reservoir" kind holds every d/s node
        # below the level at that head while nodes above keep draining — the
        # rainfall boundary the engineer entered, never an invented one.
        block2_level = rainfall_level if case == "rainfall" else tail_level
        if block2_level is not None:
            seep["H3"] = "reservoir"
            seep["I3"] = float(block2_level)
            for i, (x, y) in enumerate(ds_pts):
                seep.cell(row=5 + i, column=8, value=x)
                seep.cell(row=5 + i, column=9, value=y)

        if rapid:
            # BC set 2 on 'seep bc (2)' — the post-drawdown condition. The
            # loader refuses "reservoir" blocks on sheet 2, so submerged
            # stretches are written as plain head blocks filtered to the
            # points actually below each level.
            seep2 = wb["seep bc (2)"]

            def write_head_block(x_col, level, pts):
                seep2.cell(row=3, column=x_col, value="head")
                seep2.cell(row=3, column=x_col + 1, value=float(level))
                row = 5
                for x, y in pts:
                    if y <= float(level) + 1e-9:
                        seep2.cell(row=row, column=x_col, value=x)
                        seep2.cell(row=row, column=x_col + 1, value=y)
                        row += 1
                return row > 5

            blocks_written = []
            if case == "drawdown-us":
                # Pool dropped to the minimum head-water; tail stays at max.
                blocks_written.append(write_head_block(5, min_headwater, us_pts))
                blocks_written.append(write_head_block(8, tail_level, ds_pts))
            else:  # drawdown-ds — reservoir stays full, tail drops to minimum.
                blocks_written.append(write_head_block(5, reservoir_level, us_pts))
                blocks_written.append(write_head_block(8, min_tail_level, ds_pts))
            if not any(blocks_written):
                raise ValueError(
                    "the post-drawdown boundary set holds no boundary points — "
                    "check the drawdown levels against the section"
                )

    wb.save(xlsx)
    return xlsx, analysis_type, method, slices, seepage_used, ground


def tri3_mesh(mesh):
    """Nodes and the tri3 subset of the mesh element table."""
    nodes = np.asarray(mesh["nodes"], dtype=float)
    elements = np.asarray(mesh["elements"], dtype=int)
    etypes = np.asarray(mesh["element_types"], dtype=int)
    if elements.ndim != 2 or elements.shape[1] < 3:
        return nodes, np.zeros((0, 3), dtype=int)
    if etypes.shape[0] != elements.shape[0]:
        etypes = np.full(elements.shape[0], 3, dtype=int)
    return nodes, elements[etypes == 3, :3]


def _phreatic_polyline(segments, cluster_x=0.05):
    """Assemble crossing points into one x-monotonic polyline.

    The free surface of an embankment is single-valued in x, so crossing
    points are clustered along x instead of walking a segment graph — immune
    to the ambiguous junctions that appear where nodal pressure sits exactly
    at zero.
    """
    points = sorted(pt for seg in segments for pt in seg)
    line = []
    group = []
    for pt in points:
        if group and pt[0] - group[-1][0] > cluster_x:
            line.append(
                (
                    sum(q[0] for q in group) / len(group),
                    sum(q[1] for q in group) / len(group),
                )
            )
            group = []
        group.append(pt)
    if group:
        line.append(
            (
                sum(q[0] for q in group) / len(group),
                sum(q[1] for q in group) / len(group),
            )
        )
    return line


def phreatic_from_solution(mesh, solution):
    """The phreatic surface as the interpolated p = 0 contour of the head field."""
    phreatic, _ = seepage_contours(mesh, solution)
    return phreatic


def seepage_contours(mesh, solution):
    """Phreatic polyline + per-node pressure head for one seepage solution.

    The zero-pressure level set is linearly interpolated across every mesh
    triangle and stitched into one polyline — the same contour XSLOPE draws —
    so the line follows the physical free surface instead of stepping between
    irregularly spaced node tops.
    """
    nodes, triangles = tri3_mesh(mesh)
    head = np.asarray(solution["head"], dtype=float).ravel()
    if len(triangles) == 0 or len(head) < len(nodes):
        return [], None
    pressure = head[: len(nodes)] - nodes[:, 1]

    segments = []
    eps = 1e-12
    for ia, ib, ic in triangles:
        corner_nodes = (ia, ib, ic)
        p = (pressure[ia], pressure[ib], pressure[ic])
        crossings = []
        for i, j in ((0, 1), (1, 2), (2, 0)):
            pi, pj = p[i], p[j]
            if abs(pj - pi) > eps and (pi <= 0.0 <= pj or pj <= 0.0 <= pi):
                t = pi / (pi - pj)
                na = nodes[corner_nodes[i]]
                nb = nodes[corner_nodes[j]]
                pt = (float(na[0] + (nb[0] - na[0]) * t),
                      float(na[1] + (nb[1] - na[1]) * t))
                if not any(
                    abs(pt[0] - q[0]) < 1e-9 and abs(pt[1] - q[1]) < 1e-9
                    for q in crossings
                ):
                    crossings.append(pt)
        if len(crossings) == 2:
            segments.append((crossings[0], crossings[1]))

    phreatic = (
        [[round(float(x), 3), round(float(y), 3)] for x, y in _phreatic_polyline(segments)]
        if segments
        else []
    )
    return phreatic, pressure


def seep_field_payload(mesh, solution):
    """Mesh + total-head field arrays mirroring XSLOPE's filled-contour figure."""
    try:
        nodes, triangles = tri3_mesh(mesh)
        head = np.asarray(solution["head"], dtype=float).ravel()
    except (KeyError, TypeError, ValueError):
        return None
    if len(nodes) == 0 or len(triangles) == 0 or len(head) < len(nodes):
        return None
    return {
        "nodes": [[round(float(x), 3), round(float(y), 3)] for x, y in nodes],
        "triangles": [[int(a), int(b), int(c)] for a, b, c in triangles],
        "head": [float(f"{v:.4g}") for v in head[: len(nodes)]],
    }


def fem_field_payload(fem_data, mesh, solution):
    """Mesh + at-failure field arrays for the renderer's native FEM diagram.

    Mirrors what XSLOPE's own FEM figure draws — shear-strain contour bands,
    plastic elements and an exaggerated deformed outline — but as compact
    arrays the app renders itself. Returns None when the solve carried no
    usable field or the mesh is too large to ship through the JSON channel.
    """
    try:
        nodes = np.asarray(mesh["nodes"], dtype=float)
        elements = np.asarray(mesh["elements"], dtype=int)
        etypes = np.asarray(mesh["element_types"], dtype=int)
    except (KeyError, TypeError, ValueError):
        return None
    tri_mask = etypes == 3
    triangles = elements[tri_mask, :3]
    if len(nodes) == 0 or len(triangles) == 0:
        return None

    disp = np.asarray(solution.get("displacements", []), dtype=float).ravel()
    dof_offset = fem_data.get("dof_offset", None) if isinstance(fem_data, dict) else None
    disp_mag = None
    if disp.size >= 2 * len(nodes):
        n_nodes = len(nodes)
        u = np.empty(n_nodes)
        v = np.empty(n_nodes)
        if dof_offset is not None:
            offset = np.asarray(dof_offset, dtype=int)[:n_nodes]
            u = disp[offset]
            v = disp[offset + 1]
        else:
            u = disp[0 : 2 * n_nodes : 2]
            v = disp[1 : 2 * n_nodes : 2]
        elastic = solution.get("displacements_elastic", None)
        if elastic is not None:
            elastic = np.asarray(elastic, dtype=float).ravel()
            if elastic.size >= 2 * n_nodes:
                if dof_offset is not None:
                    u = u - elastic[offset]
                    v = v - elastic[offset + 1]
                else:
                    u = u - elastic[0 : 2 * n_nodes : 2]
                    v = v - elastic[1 : 2 * n_nodes : 2]
        disp_mag = np.sqrt(u ** 2 + v ** 2)

    n_elem_rows = elements.shape[0] if elements.ndim == 2 else 0
    vp_strain = None
    raw_strain = solution.get("vp_shear_strain", None)
    if raw_strain is None:
        raw_strain = solution.get("strains", None)
        try:
            as_array = np.asarray(raw_strain, dtype=float)
            if as_array.ndim >= 2 and as_array.shape[1] >= 4:
                raw_strain = as_array[:, 3]
            else:
                raw_strain = None
        except (TypeError, ValueError):
            raw_strain = None
    if raw_strain is not None:
        try:
            per_elem = np.asarray(raw_strain, dtype=float).ravel()
            if per_elem.size >= n_elem_rows and n_elem_rows > 0:
                # Solved fields are indexed by mesh element; remap onto the tri3 subset.
                vp_strain = per_elem[:n_elem_rows][tri_mask]
        except (TypeError, ValueError):
            vp_strain = None

    plastic = None
    raw_plastic = solution.get("plastic_elements", None)
    if raw_plastic is not None:
        try:
            plastic_full = np.asarray(raw_plastic).astype(bool).ravel()
            if plastic_full.size >= n_elem_rows and n_elem_rows > 0:
                plastic = plastic_full[:n_elem_rows][tri_mask]
        except (TypeError, ValueError):
            plastic = None

    deform_scale = 1.0
    if disp_mag is not None:
        max_disp = float(np.max(disp_mag)) if disp_mag.size else 0.0
        mesh_height = float(np.max(nodes[:, 1]) - np.min(nodes[:, 1]))
        if max_disp > 1e-30 and mesh_height > 0:
            deform_scale = max(1.0, (mesh_height * 0.15) / max_disp)

    field = {
        "nodes": [[round(float(x), 3), round(float(y), 3)] for x, y in nodes],
        "triangles": [[int(a), int(b), int(c)] for a, b, c in triangles],
        "deformScale": round(deform_scale, 2),
    }
    if disp_mag is not None:
        field["dispMag"] = [float(f"{v:.4g}") for v in disp_mag]
    try:
        if disp.size >= 2 * len(nodes):
            n_nodes = len(nodes)
            if dof_offset is not None:
                offset_full = np.asarray(dof_offset, dtype=int)[:n_nodes]
                ux = disp[offset_full]
                vy = disp[offset_full + 1]
                if solution.get("displacements_elastic") is not None:
                    el = np.asarray(solution["displacements_elastic"], dtype=float).ravel()
                    ux = ux - el[offset_full]
                    vy = vy - el[offset_full + 1]
            else:
                ux = disp[0 : 2 * n_nodes : 2]
                vy = disp[1 : 2 * n_nodes : 2]
                if solution.get("displacements_elastic") is not None:
                    el = np.asarray(solution["displacements_elastic"], dtype=float).ravel()
                    ux = ux - el[0 : 2 * n_nodes : 2]
                    vy = vy - el[1 : 2 * n_nodes : 2]
            field["dispX"] = [float(f"{v:.4g}") for v in ux]
            field["dispY"] = [float(f"{v:.4g}") for v in vy]
    except Exception:  # noqa: BLE001 — deformed outline is optional garnish
        pass
    if vp_strain is not None:
        field["shearStrain"] = [float(f"{v:.4g}") for v in vp_strain]
    if plastic is not None:
        field["plastic"] = [bool(b) for b in plastic]
    return field


def run_case(request):
    run_id = str(request.get("runId") or "")
    started = time.time()
    warnings = []
    workdir = tempfile.mkdtemp(prefix="eestimate-bund-")
    try:
        case = str(request.get("case"))
        rapid = case in DRAWDOWN_CASES
        treatment = case_treatment(request)
        xlsx, analysis_type, method, slices, seepage_used, ground = build_workbook(
            request, workdir
        )
        if rapid and analysis_type == "fem-ssrm":
            raise ValueError(
                "FEM strength reduction does not support the staged drawdown "
                "cases — use a limit-equilibrium method"
            )
        slope_data = fileio.load_slope_data(xlsx)
        # Face restriction: the case names the slope it checks, so the search
        # must not report a circle from the other face. right_facing fixes the
        # sliding direction (False = slides left = upstream, True = slides
        # right = downstream) and directs the LEM seismic force with it; the
        # starting circles are filtered to the same face below.
        slope_side = str(request.get("slope") or "both").lower()
        right_facing = None
        if slope_side == "downstream":
            right_facing = True
        elif slope_side == "upstream":
            right_facing = False
        elif slope_side != "both":
            raise ValueError(
                f"unsupported slope {slope_side!r}; use upstream, downstream or both"
            )
        if right_facing is not None:
            slope_data["right_facing"] = right_facing
        # VI-B shakes the upstream slope: the pseudo-static force must act
        # toward -x. The LEM reads |k| with direction from right_facing; the
        # FEM applies the sign as entered, so flip it there.
        kh = float((request.get("loading") or {}).get("kh") or 0)
        if case == "quake-full" and kh:
            slope_data["k_seismic"] = -abs(kh)

        solution = None
        solution2 = None
        mesh = None
        if seepage_used or analysis_type == "fem-ssrm":
            polygons = xmesh.get_material_polygons(slope_data)
            controls = request.get("controls") or {}
            mesh_size = float(
                controls.get("meshSizeM")
                or slope_data.get("target_size")
                or DEFAULT_MESH_SIZE_M
            )
            mesh = xmesh.build_mesh_from_polygons(
                polygons,
                mesh_size,
                element_type="tri3",
                profile_lines=slope_data["profile_lines"],
            )
            slope_data["mesh"] = mesh

        if seepage_used:
            seep_data = xseep.build_seep_data(mesh, slope_data)
            solution = xseep.run_seepage_analysis(seep_data)
            xseep.apply_steady_stability_field(slope_data, solution, bc=1)
            closure = solution.get("closure_fraction")
            if closure is not None and abs(float(closure)) > 0.01:
                warnings.append(
                    f"Seepage flow balance closed to {abs(float(closure)) * 100:.2f}%."
                )
            if rapid:
                # Stage 2: the post-drawdown field from the 'seep bc (2)' set.
                seep_data2 = xseep.build_seep_data(mesh, slope_data, seep_bc=2)
                solution2 = xseep.run_seepage_analysis(seep_data2)
                xseep.apply_steady_stability_field(slope_data, solution2, bc=2)

        phreatic = []
        seep_field = None
        if solution is not None:
            try:
                phreatic, _ = seepage_contours(mesh, solution)
            except Exception:  # noqa: BLE001 — the line is a nicety, not the result
                phreatic = []
            try:
                seep_field = seep_field_payload(mesh, solution)
            except Exception:  # noqa: BLE001 — the figure must never sink a result
                seep_field = None

        # Rapid drawdown genuinely solves two boundary fields.  The first
        # field above represents the pre-drawdown condition; solution2 is the
        # post-drawdown boundary condition already consumed by XSLOPE's staged
        # FS procedure.  Return both so the UI does not misleadingly show only
        # the identical full-pool starting field for Cases III-A and III-B.
        post_drawdown_phreatic = []
        post_drawdown_seep_field = None
        if solution2 is not None:
            try:
                post_drawdown_phreatic, _ = seepage_contours(mesh, solution2)
            except Exception:  # noqa: BLE001 — the line is a nicety, not the result
                post_drawdown_phreatic = []
            try:
                post_drawdown_seep_field = seep_field_payload(mesh, solution2)
            except Exception:  # noqa: BLE001 — the figure must never sink a result
                post_drawdown_seep_field = None

        if analysis_type == "fem-ssrm":
            # Import lazily: xslope.fem has a substantial scientific stack and
            # should not add startup time to ordinary LEM runs.
            from xslope.fem import build_fem_data, solve_ssrm

            controls = request.get("controls") or {}
            fem_data = build_fem_data(slope_data, mesh=mesh)
            ssrm = solve_ssrm(
                fem_data,
                tolerance=float(controls.get("tolerance") or 0.02),
                max_iterations=int(controls.get("maxIterations") or 3000),
                failure_criterion="hybrid",
                # One extra solve just beyond critical captures the failure
                # mechanism (displacement + shear-strain field) the renderer
                # draws; FS and the bracket are bit-identical either way.
                capture_failure_state=True,
                debug_level=0,
            )
            fs_raw = ssrm.get("FS")
            if not ssrm.get("converged") or fs_raw is None:
                return {
                    "schemaVersion": SCHEMA_VERSION,
                    "runId": run_id,
                    "status": "not-evaluated",
                    "message": "The FEM strength-reduction search did not form a stable failure bracket.",
                    "engine": engine_info(),
                    "warnings": warnings,
                    "diagnostics": {
                        "runtimeSeconds": round(time.time() - started, 2),
                        "analysisType": analysis_type,
                    },
                }

            interval = ssrm.get("final_interval")
            last_solution = ssrm.get("last_solution") or {}
            max_displacement = last_solution.get("max_displacement")
            # Prefer the captured at-failure mechanism; fall back to the last
            # converged trial when the capture solve did not land.
            field_solution = (
                ssrm.get("failure_solution")
                or last_solution
                or {}
            )
            field = None
            if isinstance(field_solution, dict) and field_solution:
                try:
                    field = fem_field_payload(fem_data, mesh, field_solution)
                except Exception:  # noqa: BLE001 — a diagram must never sink a result
                    field = None
            return {
                "schemaVersion": SCHEMA_VERSION,
                "runId": run_id,
                "status": "ok",
                "engine": engine_info(),
                "analysisType": analysis_type,
                "method": "fem-ssrm",
                "treatment": treatment,
                "factorOfSafety": round(float(fs_raw), 4),
                "criticalSurface": None,
                "slices": [],
                "phreaticLine": phreatic,
                **({"seepField": seep_field} if seep_field is not None else {}),
                **(
                    {"postDrawdownPhreaticLine": post_drawdown_phreatic}
                    if solution2 is not None
                    else {}
                ),
                **(
                    {"postDrawdownSeepField": post_drawdown_seep_field}
                    if post_drawdown_seep_field is not None
                    else {}
                ),
                "warnings": warnings,
                "femResult": {
                    "finalInterval": (
                        [round(float(interval[0]), 4), round(float(interval[1]), 4)]
                        if interval is not None
                        else None
                    ),
                    "failureCriterion": str(
                        ssrm.get("failure_criterion") or "hybrid"
                    ),
                    "iterations": int(ssrm.get("iterations_ssrm") or 0),
                    "nodeCount": int(len(mesh["nodes"])),
                    "elementCount": int(len(mesh["elements"])),
                    "maxDisplacementM": (
                        round(float(max_displacement), 6)
                        if max_displacement is not None
                        else None
                    ),
                    **({"field": field} if field is not None else {}),
                },
                "diagnostics": {
                    "runtimeSeconds": round(time.time() - started, 2),
                    "analysisType": analysis_type,
                    "ssrmTrials": len(ssrm.get("trials") or []),
                    "meshSizeM": float(
                        controls.get("meshSizeM") or DEFAULT_MESH_SIZE_M
                    ),
                    "slope": slope_side,
                    "khApplied": (
                        -abs(kh) if case == "quake-full" else abs(kh)
                    ),
                },
            }

        circles = generate_starting_circles(slope_data)
        if right_facing is not None and circles:
            # Keep only the circles seeded on the checked face: the crest is
            # the highest point of the ground surface, upstream circles sit
            # left of it, downstream circles right of it.
            try:
                from xslope.generators import slope_geometry

                ground_pts = slope_geometry(slope_data).ground
                crest_x = max(ground_pts, key=lambda p: p[1])[0]
                if slope_side == "upstream":
                    face_circles = [c for c in circles if float(c["Xo"]) <= crest_x]
                else:
                    face_circles = [c for c in circles if float(c["Xo"]) >= crest_x]
                if face_circles:
                    circles = face_circles
                else:
                    warnings.append(
                        "No starting circles fell on the checked face; the search "
                        "ran on the full circle set."
                    )
            except Exception:  # noqa: BLE001 — filtering is an accuracy aid, not a gate
                pass
        slope_data["circles"] = circles
        slope_data["circular"] = True

        bundle = run_lem_analysis(
            slope_data, method, num_slices=slices, grid_seed=True, rapid=rapid
        )
        results = bundle.get("results")
        surface = bundle.get("failure_surface")
        if results is None or results.get("FS") is None or surface is None:
            reason = bundle.get("failure")
            if reason is not None and not isinstance(reason, str):
                reason = str(reason)
            return {
                "schemaVersion": SCHEMA_VERSION,
                "runId": run_id,
                "status": "not-evaluated",
                "message": f"No converged slip surface: {reason or 'the solver returned no solution'}",
                "engine": engine_info(),
                "warnings": warnings,
                "diagnostics": {"runtimeSeconds": round(time.time() - started, 2)},
            }

        fs = float(results["FS"])
        df = bundle["slice_df"]
        radius = float(df["r"].iloc[0]) if "r" in df and len(df) else None
        center = (
            [round(float(df["xo"].iloc[0]), 3), round(float(df["yo"].iloc[0]), 3)]
            if "xo" in df and len(df)
            else None
        )
        surf_coords = [
            [round(float(x), 3), round(float(y), 3)]
            for x, y in surface.coords
        ]
        slices_out = []
        for _, srow in df.iterrows():
            slices_out.append(
                {
                    "xLeft": round(float(srow["x_l"]), 3),
                    "topY": round(float(srow["y_lt"]), 3),
                    "baseY": round(float(srow["y_lb"]), 3),
                    "xRight": round(float(srow["x_r"]), 3),
                    "weight": round(float(srow["w"]), 3),
                }
            )

        return {
            "schemaVersion": SCHEMA_VERSION,
            "runId": run_id,
            "status": "ok",
            "engine": engine_info(),
            "analysisType": "lem",
            "method": method,
            "treatment": treatment,
            "factorOfSafety": round(fs, 4),
            "criticalSurface": {
                "type": "circle",
                "center": center,
                "radius": None if radius is None else round(radius, 3),
                "surface": surf_coords,
            },
            "slices": slices_out,
            "phreaticLine": phreatic,
            **({"seepField": seep_field} if seep_field is not None else {}),
            **(
                {"postDrawdownPhreaticLine": post_drawdown_phreatic}
                if solution2 is not None
                else {}
            ),
            **(
                {"postDrawdownSeepField": post_drawdown_seep_field}
                if post_drawdown_seep_field is not None
                else {}
            ),
            "warnings": warnings,
            "diagnostics": {
                "runtimeSeconds": round(time.time() - started, 2),
                "trialSurfacesEvaluated": len(
                    (bundle.get("search") or {}).get("fs_cache") or {}
                ),
                "sliceCount": len(slices_out),
                "startingCircles": len(circles),
                "slope": slope_side,
                "khApplied": (
                    -abs(kh) if case == "quake-full" else abs(kh)
                ),
            },
        }
    except Exception as exc:  # noqa: BLE001 — the protocol reports every failure
        return {
            "schemaVersion": SCHEMA_VERSION,
            "runId": run_id,
            "status": "error",
            "message": f"{type(exc).__name__}: {exc}",
            "engine": engine_info(),
            "warnings": warnings,
            "diagnostics": {"runtimeSeconds": round(time.time() - started, 2)},
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def case_treatment(request):
    """Human-readable record of the water/loading condition actually solved."""
    case = str(request.get("case"))
    water = request.get("water") or {}
    loading = request.get("loading") or {}

    def lvl(key):
        v = water.get(key)
        try:
            return f"{float(v):g} m"
        except (TypeError, ValueError):
            return "—"

    if case == "construction":
        return "End of construction (u = 0, total stress)"
    if case == "partial-pool":
        return f"Steady seepage at pool {lvl('reservoirLevel')}"
    if case == "steady-seepage":
        return f"Steady seepage, reservoir full at {lvl('reservoirLevel')}"
    if case == "rainfall":
        return (
            f"Steady seepage, reservoir full, d/s face saturated to "
            f"{lvl('rainfallLevel')} (sustained rainfall)"
        )
    if case == "drawdown-us":
        return (
            f"Staged rapid drawdown: pool {lvl('reservoirLevel')} → "
            f"{lvl('minHeadwater')}, tail at {lvl('tailWaterMax')}"
        )
    if case == "drawdown-ds":
        return (
            f"Staged rapid drawdown: tail {lvl('tailWaterMax')} → "
            f"{lvl('tailWaterMin')}, reservoir full at {lvl('reservoirLevel')}"
        )
    if case in ("quake-seepage", "quake-full"):
        try:
            kh = f"{float(loading.get('kh')):g}g"
        except (TypeError, ValueError):
            kh = "—"
        return f"Steady seepage, reservoir full, pseudo-static kh = {kh}"
    return case


def engine_info():
    try:
        version = importlib.metadata.version("xslope")
    except Exception:  # noqa: BLE001
        version = "unknown"
    return {"name": "XSLOPE", "version": version, "bridgeVersion": BRIDGE_VERSION}


def main():
    try:
        request = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        fail("", f"Invalid request JSON: {exc}")
    # The engine libraries chatter: print() goes through Python's sys.stdout,
    # while gmsh writes straight to file descriptor 1. Both are silenced by
    # swapping fd 1 to fd 2 (stderr) around the run, so stdout carries nothing
    # but this bridge's own JSON.
    sys.stdout.flush()
    saved_fd = os.dup(1)
    os.dup2(2, 1)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            response = run_case(request)
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, 1)
        os.close(saved_fd)
    json.dump(response, sys.stdout)
    sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
