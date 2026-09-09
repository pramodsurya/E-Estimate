# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files


analysis_dir = Path(SPECPATH)

a = Analysis(
    [str(analysis_dir / "bund_analysis.py")],
    pathex=[str(analysis_dir)],
    binaries=[],
    datas=collect_data_files("xslope"),
    hiddenimports=["xslope.fem"],
    hookspath=[],
    hooksconfig={"matplotlib": {"backends": "Agg"}},
    runtime_hooks=[],
    excludes=[
        "dask",
        "distributed",
        "IPython",
        "jedi",
        "xarray",
        "botocore",
        "boto3",
        "s3fs",
        "fsspec",
        "netCDF4",
        "PySide6",
        "PyQt5",
        "PyQt6",
        "tkinter",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="bund-analysis",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="bund-analysis",
)
