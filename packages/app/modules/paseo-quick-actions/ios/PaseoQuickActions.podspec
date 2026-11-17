Pod::Spec.new do |s|
  s.name = 'PaseoQuickActions'
  s.version = '0.1.0'
  s.summary = 'Home screen quick action handoff for Paseo'
  s.description = 'Keeps the home screen quick action the user chose until JavaScript takes it'
  s.license = 'Apache-2.0'
  s.author = 'Paseo'
  s.homepage = 'https://paseo.sh'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.4'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
