require 'xcodeproj'
require 'fileutils'

project_path = 'App.xcodeproj'
unless File.exist?(project_path)
  puts "Error: App.xcodeproj not found at #{project_path}"
  exit 1
end

project = Xcodeproj::Project.open(project_path)

# 1. Add WatchConnectorPlugin files to the iOS App target
app_target = project.targets.find { |t| t.name == 'App' }
unless app_target
  puts "Error: App target not found"
  exit 1
end

app_group = project.main_group['App']
unless app_group
  puts "Error: App group not found in Xcode project structure"
  exit 1
end

# Add WatchConnectorPlugin to the App target if not already present
plugin_swift_ref = app_group.find_file_by_path('WatchConnectorPlugin.swift')
unless plugin_swift_ref
  plugin_swift_ref = app_group.new_file('WatchConnectorPlugin.swift')
  app_target.source_build_phase.add_file_reference(plugin_swift_ref)
  puts "Added WatchConnectorPlugin.swift to App target compile sources"
end

plugin_m_ref = app_group.find_file_by_path('WatchConnectorPlugin.m')
unless plugin_m_ref
  plugin_m_ref = app_group.new_file('WatchConnectorPlugin.m')
  app_target.source_build_phase.add_file_reference(plugin_m_ref)
  puts "Added WatchConnectorPlugin.m to App target compile sources"
end

# 2. Create the WatchApp target
watch_target = project.targets.find { |t| t.name == 'WatchApp' }
if watch_target
  puts "WatchApp target already exists in project, skipping creation"
else
  # Create modern watchOS app target (:watch2_app maps to com.apple.product-type.application.watchapp2)
  watch_target = project.new_target(:watch2_app, 'WatchApp', :watchos, '9.0')
  watch_target.product_type = 'com.apple.product-type.application.watchapp2'
  puts "Created WatchApp target successfully"
  
  # Configure watch target build settings for both Debug and Release configurations
  watch_target.build_configurations.each do |config|
    config.build_settings['SDKROOT'] = 'watchos'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.softspace.app.watch'
    config.build_settings['INFOPLIST_FILE'] = 'WatchApp/Info.plist'
    config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
    config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
    config.build_settings['MARKETING_VERSION'] = '1.0'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '4' # watch
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks'
    config.build_settings['SKIP_INSTALL'] = 'YES'
    config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  end

  # Create physical and virtual group for WatchApp
  watch_group = project.main_group['WatchApp']
  unless watch_group
    watch_group = project.main_group.new_group('WatchApp', 'WatchApp')
  end
  
  # Add SwiftUI/Swift code files to compile sources
  swift_files = ['WatchApp.swift', 'WatchContentView.swift', 'WatchSessionManager.swift']
  swift_files.each do |file|
    file_ref = watch_group.new_file(file)
    watch_target.source_build_phase.add_file_reference(file_ref)
  end
  
  # Add Info.plist file to the group
  watch_group.new_file('Info.plist')
  
  # 3. Add target dependency to iOS target
  dependency = project.new(Xcodeproj::Project::Object::PBXTargetDependency)
  dependency.target = watch_target
  dependency.target_proxy = project.new(Xcodeproj::Project::Object::PBXContainerItemProxy)
  dependency.target_proxy.container_portal = project.root_object.uuid
  dependency.target_proxy.proxy_type = '1'
  dependency.target_proxy.remote_global_id_string = watch_target.uuid
  dependency.target_proxy.remote_info = watch_target.name
  app_target.dependencies << dependency
  puts "Added dependency: App now depends on WatchApp target"

  # 4. Embed WatchApp in main iOS target
  # Create a PBXCopyFilesBuildPhase for watch content
  embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed_phase.name = 'Embed Watch Content'
  embed_phase.dst_subfolder_spec = '16' # Products Directory
  embed_phase.dst_path = ''
  app_target.build_phases << embed_phase
  
  # Add the watch target product reference to the embed phase
  build_file = embed_phase.add_file_reference(watch_target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts "Configured Embed Watch Content build phase for App target"
end

project.save
puts "Successfully configured Xcode project file for watchOS!"
