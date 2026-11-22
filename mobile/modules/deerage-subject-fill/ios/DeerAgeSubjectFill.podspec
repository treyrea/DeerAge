require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name           = "DeerAgeSubjectFill"
  s.version        = package["version"]
  s.summary        = package["description"]
  s.description    = package["description"]
  s.author         = "DeerAge"
  s.homepage       = "https://github.com/treyrea/DeerAge"
  s.license        = "UNLICENSED"
  s.platforms      = { :ios => "15.1" }
  s.source         = { git: "" }
  s.static_framework = true
  s.source_files   = "*.{h,m,mm,swift}"
  s.frameworks     = "Vision", "UIKit"
  s.dependency "ExpoModulesCore"
end
