# Change Log

All notable changes to the "keil-assistant" extension will be documented in this file.

## [v1.9.5]
- Fixed: 
- #53 #56 Error: open project TypeError: Cannot read properties of undefined (reading 'targetInfos')
***

## [v1.9.4]
- Fixed: 
- remove RTE will inclue more header files; do not inclue its.
***

## [v1.9.3]
- Fixed: 
- #41 RTE ARM Compiler include
- Added support for multi-language menus;
- V1.9.3+ version ⚠️ adjustment: VsCode supports the minimum version of vscode engines V1.73.0+, please update to V1.73.0 or later, this adjustment is because the minimum supported version of the multi-language version is 1.73.0; [**l10n** This API, introduced in VS Code 1.73](https://github.com/microsoft/vscode-l10n/blob/main/README.md)
***

## [v1.9.2]
- Fixed: 
- #40 open project Error: This uVision project is not a C51 project, but have a 'uvproj' suffix !
- #39 Support ARM7 and ARM9 MCU
- #41 Support project custom include paths
***

## [v1.9.1]
- Fixed:
- #31 Optimized the dependency of the keil uVision assistant on other expansion packages
***

## [v1.9.0]
- Fixed:
- #25 #27 Build Error or Warning log cannot goto error file line number
- #26 keil projectx file in subdirectory will show include error and update includePath message.
***

## [v1.8.9]
- Fixed:
- #19 RTE macros import not form Non RTE project
- #17 Uv4 log out put show
***

## [v1.8.8]
- Fixed:
- RTE macros
***

## [v1.8.7]
- Fixed:
- Build log are garbled
***

## [v1.8.6]
- Fixed:
- Keil log out show
***

## [v1.8.5]
- Feature:
- #13 Arm Clang V6 Newer Versions Get the correct parameters for the built-in macros
- Added error highlighting and automatic redirection
***

## [v1.8.4]
- Fixed:
- #12 optimize Keil log out show
***

## [v1.8.3]
- Feature:
- Added support for regular extension packs
***

## [v1.8.2]
- Fixed: package signed error
***

## [v1.8.1]
- Fixed:
- #3 search sub folder project file
- #10 suppert *.unmpw Project workspace 
***

## [v1.8.0]
- Feature: 
- #8 keil MDK/C51/C251 alone set Home PATH, Must reset PATH in settings
- setting show with l10n language
- #9 Support keil MDK RTE includes
***

## [v1.7.9]
- Fixed: #7 log out Chinese garbled characters
***
 
## [v1.7.8]
- Fixed: #5 vscode engines version to 1.74.0,  #6 Arm clang genrate Macros
***

## [v1.7.7]
- Fixed: Include path for ARMCLANG with uvprojx
***
  
## [v1.7.6]
- Fixed: Include In Build icon is not show
***
 
## [v1.7.5]
- Fixed: include list for multiple targets
***
  
## [v1.7.4]
- Fixed: Log output channel mybe repeat show others log
***

## [v1.7.3]
- Optimize: Simplify keil configuration only use Keil installaction directory (C:\Keil_v5)
- Feature: Record the selection target
***

## [v1.7.2]
- Feature: support C251
***


## [v1.7.1]
- Fixed: can't use shortcut key
***


## [v1.7.0]
- Change: adjust view
- Optimize: Update doc
- Optimize: support double click to open file with non-preview mode
***

## [v1.6.2]
- Fixed: output messy code
- Optimize: extend more armcc keywords
***

## [v1.6.1]
- Fixed: error rebuild command
***

## [v1.6.0]
- New: support show source referance files
- New: add exclude list on open multi-project workspace
***

## [v1.5.0]
- New: add 'Active Target' button
- Changed: adjust keybindings
***

## [v1.4.0]
- New: support multi-target keil project
- New: add armclang cpp macros
***

## [v1.3.3]
- Optimize: extend more armcc keywords
***

## [v1.3.2]
- Fixed: some incorrect C51 keywords
- Fixed: some other bugs
***

## [v1.3.1]
- Fixed: add missed system include path
- Changed: remove c51 language highlight
- Optimized: add more system macro
***

## [v1.3.0]
- Add: switch workspace after open project
- Changed: change icon
- Fixed: build failed without workspace
***

## [v1.2.1]
- Add: Add some internal defines for ARM/C51
***

## [v1.2.0]
- Fixed: Can't run task by CMD
- Add: Shortcut keys
***

## [v1.1.0]
- Fixed: Not found C51/STM32 system include dir
- Fixed: Invalid macro
***

## [v1.0.0]
- First release