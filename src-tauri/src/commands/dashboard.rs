use crate::db::DatabaseManager;
use crate::dashboard::{self, DashboardLayoutPayload};

#[tauri::command]
pub async fn get_dashboard_layout() -> Result<DashboardLayoutPayload, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.get_dashboard_layout(dashboard::DEFAULT_LAYOUT_ID)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_dashboard_layout(layout: DashboardLayoutPayload) -> Result<DashboardLayoutPayload, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.save_dashboard_layout(dashboard::DEFAULT_LAYOUT_ID, &layout)
        .await
        .map_err(|e| e.to_string())?;
    Ok(layout)
}

#[tauri::command]
pub async fn reset_dashboard_layout() -> Result<DashboardLayoutPayload, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.reset_dashboard_layout(dashboard::DEFAULT_LAYOUT_ID)
        .await
        .map_err(|e| e.to_string())
}
