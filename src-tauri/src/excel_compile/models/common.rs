use serde::Deserialize;

pub(super) fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct SignaturePayload {
    #[serde(default)]
    pub designation: String,
    #[serde(default)]
    pub office: String,
}
