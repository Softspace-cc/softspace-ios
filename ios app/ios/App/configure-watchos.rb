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

# 2. Remove any existing broken WatchApp target so we can recreate it cleanly
existing_watch = project.targets.find { |t| t.name == 'WatchApp' }
if existing_watch
  puts "Removing existing WatchApp target to recreate cleanly..."
  # Remove dependency from App target
  app_target.dependencies.reject! { |d| d.target == existing_watch }
  # Remove embed build phases referencing the watch product
  app_target.build_phases.reject! { |bp|
    bp.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) && bp.name == 'Embed Watch Content'
  }
  existing_watch.remove_from_project
end

# Remove existing WatchApp group if present
existing_group = project.main_group['WatchApp']
existing_group.remove_from_project if existing_group

# 3. Create fresh WatchApp target as a standard application targeting watchOS
watch_target = project.new_target(:application, 'WatchApp', :watchos, '9.0')
watch_target.product_name = 'WatchApp'
puts "Created WatchApp target (product type: #{watch_target.product_type})"

# Fix product reference name and path
if watch_target.product_reference
  watch_target.product_reference.name = 'WatchApp.app'
  watch_target.product_reference.path = 'WatchApp.app'
end

# Configure build settings
watch_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = 'WatchApp'
  config.build_settings['SDKROOT'] = 'watchos'
  config.build_settings['SUPPORTED_PLATFORMS'] = 'watchos watchsimulator'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.softspace.app.watch'
  config.build_settings['INFOPLIST_FILE'] = 'WatchApp/Info.plist'
  config.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['MARKETING_VERSION'] = '1.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '4'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
end

# 4. Create WatchApp file group and add source files
watch_group = project.main_group.new_group('WatchApp', 'WatchApp')

swift_files = ['WatchApp.swift', 'WatchContentView.swift', 'WatchSessionManager.swift']
swift_files.each do |file|
  file_ref = watch_group.new_file(file)
  watch_target.source_build_phase.add_file_reference(file_ref)
  puts "  Added #{file} to WatchApp compile sources"
end

# Add Info.plist to the group (not to compile sources)
watch_group.new_file('Info.plist')

# 5. Add target dependency: App depends on WatchApp
dependency = project.new(Xcodeproj::Project::Object::PBXTargetDependency)
dependency.target = watch_target
dependency.target_proxy = project.new(Xcodeproj::Project::Object::PBXContainerItemProxy)
dependency.target_proxy.container_portal = project.root_object.uuid
dependency.target_proxy.proxy_type = '1'
dependency.target_proxy.remote_global_id_string = watch_target.uuid
dependency.target_proxy.remote_info = 'WatchApp'
app_target.dependencies << dependency
puts "Added dependency: App -> WatchApp"

# 6. Embed WatchApp inside the iOS app bundle at App.app/Watch/
embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
embed_phase.name = 'Embed Watch Content'
embed_phase.dst_subfolder_spec = '16'  # Products Directory
embed_phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
app_target.build_phases << embed_phase

build_file = embed_phase.add_file_reference(watch_target.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
puts "Configured Embed Watch Content build phase (destination: Watch/)"

project.save
puts "Successfully configured Xcode project for watchOS!"
