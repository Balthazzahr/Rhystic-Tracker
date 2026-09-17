use crate::db::DatabaseManager;
use crate::dashboard::{self, DashboardLayoutPayload};
use sqlx::Row;

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

#[tauri::command]
pub async fn get_card_win_correlations() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        r#"
        SELECT 
            mc.grp_id,
            COALESCE(c.name, 'Unknown') as card_name,
            COUNT(DISTINCT m.id) as total_games,
            SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        LEFT JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE mc.is_opponent = 0 
          AND c.name NOT LIKE '%Plains%' 
          AND c.name NOT LIKE '%Island%' 
          AND c.name NOT LIKE '%Swamp%' 
          AND c.name NOT LIKE '%Mountain%' 
          AND c.name NOT LIKE '%Forest%'
          AND c.name NOT LIKE '%Wastes%'
          AND (c.card_type IS NULL OR c.card_type NOT LIKE '%Basic Land%')
          AND (m.result = 'win' OR m.result = 'loss')
        GROUP BY mc.grp_id
        HAVING total_games >= 2
        ORDER BY total_games DESC
        LIMIT 150
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        let grp_id: i64 = r.get("grp_id");
        let name: String = r.get("card_name");
        let total: i64 = r.get("total_games");
        let wins: i64 = r.get("wins");
        let losses: i64 = r.get("losses");
        let win_rate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

        result.push(serde_json::json!({
            "grp_id": grp_id,
            "name": name,
            "total_games": total,
            "wins": wins,
            "losses": losses,
            "win_rate": (win_rate * 10.0).round() / 10.0,
        }));
    }

    Ok(serde_json::json!(result))
}

#[tauri::command]
pub async fn get_opponent_commander_records() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        r#"
        SELECT 
            m.opponent_commander_id as grp_id,
            COALESCE(c.name, m.opponent_commander_name, 'Unknown Commander') as commander_name,
            COUNT(*) as total_matches,
            SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END) as losses,
            MAX(m.timestamp) as last_played
        FROM matches m
        LEFT JOIN cards_cache c ON m.opponent_commander_id = c.grp_id
        WHERE m.opponent_commander_id IS NOT NULL 
          AND m.opponent_commander_id > 0
          AND (m.result = 'win' OR m.result = 'loss')
        GROUP BY m.opponent_commander_id
        HAVING total_matches >= 1
        ORDER BY total_matches DESC
        LIMIT 50
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        let grp_id: i64 = r.get("grp_id");
        let name: String = r.get("commander_name");
        let total: i64 = r.get("total_matches");
        let wins: i64 = r.get("wins");
        let losses: i64 = r.get("losses");
        let last_played: Option<String> = r.try_get("last_played").ok();
        let win_rate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

        result.push(serde_json::json!({
            "grp_id": grp_id,
            "commander_name": name,
            "total_matches": total,
            "wins": wins,
            "losses": losses,
            "win_rate": (win_rate * 10.0).round() / 10.0,
            "last_played": last_played,
        }));
    }

    Ok(serde_json::json!(result))
}
