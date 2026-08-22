use rhystic_tracker::db::DatabaseManager;
use rhystic_tracker::card_db::sync_card_cache;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = DatabaseManager::init().await?;
    println!("[BULK IMPORT BENCHMARK] Initialized database target: {}", db.db_filename);

    let (imported_count, elapsed_ms) = sync_card_cache(&db.pool()).await?;
    println!("[BULK IMPORT BENCHMARK] SUCCESS: Imported {} cards into cards_cache in {} ms", imported_count, elapsed_ms);

    Ok(())
}
