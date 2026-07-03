mod commands;
mod process;
mod providers;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir)?;
            app.manage(AppState::new(data_dir));
            commands::backups::spawn_backup_scheduler(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // servers
            commands::servers::list_servers,
            commands::servers::create_server,
            commands::servers::retry_install,
            commands::servers::delete_server,
            commands::servers::start_server,
            commands::servers::stop_server,
            commands::servers::restart_server,
            commands::servers::send_command,
            commands::servers::get_logs,
            commands::servers::update_server_config,
            commands::servers::get_system_ram,
            // java
            commands::java::check_java,
            commands::java::download_java,
            // downloads
            commands::downloads::list_mc_versions,
            // properties
            commands::properties::get_properties,
            commands::properties::set_properties,
            // files
            commands::files::list_files,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::delete_path,
            commands::files::rename_path,
            commands::files::create_folder,
            commands::files::import_file,
            commands::files::save_text_file,
            commands::files::open_server_folder,
            // content
            commands::content::search_content,
            commands::content::install_content,
            commands::content::list_installed_content,
            commands::content::toggle_content,
            commands::content::remove_content,
            commands::content::install_content_from_url,
            commands::content::install_content_from_file,
            // players
            commands::players::get_players,
            commands::players::player_action,
            // network
            commands::network::get_network_info,
            commands::network::set_online_mode,
            commands::network::open_firewall_port,
            commands::network::check_port_status,
            commands::network::get_firewall_commands,
            commands::network::prepare_vps_network,
            // performance
            commands::optimize::optimize_server,
            commands::optimize::get_perf_status,
            commands::optimize::install_pregen_tool,
            commands::optimize::start_pregen,
            commands::optimize::pregen_action,
            // backups
            commands::backups::list_backups,
            commands::backups::create_backup,
            commands::backups::delete_backup,
            // settings
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
