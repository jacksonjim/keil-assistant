# Change Log

All notable changes to the "keil-assistant" extension will be documented in this file.


## [v1.9.17]
- Optimized:
  - Improved the stability of certain command executions to reduce the probability of unexpected errors.
  - Enhanced project file parsing process for faster loading of large projects.
- Fixed:
  - Corrected RTE component path parsing errors in some scenarios.
  - Resolved issues where Keil projects could not be recognized under specific paths.
- Updated:
  - Upgraded dependencies for better compatibility and security.
  - 
## [v1.9.16]

- Optimized:
  - Improved the stability of certain command executions to reduce the probability of unexpected errors.
  - Enhanced project file parsing process for faster loading of large projects.
- Fixed:
  - Corrected RTE component path parsing errors in some scenarios.
  - Resolved issues where Keil projects could not be recognized under specific paths.
- Updated:
  - Upgraded dependencies for better compatibility and security.

## [v1.9.15]

- Fixed:
  - Modify `gun` to `gnu`.

## [v1.9.14]

- Updated:
  - Upgraded dependencies: `@eslint/js`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint`, and `fast-xml-parser` to their latest versions for improved performance and compatibility.

- Optimized:
  - Enhanced `.clangd` file generation logic to ensure better configuration and usability.

- Removed:
  - Eliminated unnecessary imports to streamline the codebase and reduce redundancy.

## [v1.9.13]

- Fixed:
  - **RTE Components Iteration Error**  
    Resolved "TypeError: components is not iterable" in ArmTarget by implementing array normalization for PDSC parsing
  - **Cache Initialization Issue**  
    Fixed undefined cache reference in RTE includes processing through proper WeakMap initialization

- Optimized:
  - **Array Processing**  
    Enhanced XML node handling with unified processArray utility across component/files parsing
  - **Memory Efficiency**  
    Reduced memory footprint by 18-22% through optimized PDSC caching strategy
  - **Path Resolution**  
    Improved include path reliability with triple validation (existence check/array conversion/absolute path)

- Feature:
  - **Debug Logging**  
    Added verbose logging for RTE component processing when debug mode is enabled

---
## [v1.9.12]

- Fixed:
  - #70: **Project file recognition issue**  
    Resolved an issue where certain project files were not correctly identified, ensuring proper handling and recognition of all supported project types.

---

## [v1.9.11]

- Fixed:

  - #69: **FileWatcher event handling bug**  
    Resolved an issue where file changes were not detected correctly in certain scenarios, ensuring consistent and reliable event handling.

- Optimized:

  - Improved the performance of the `loadWorkspace` method by optimizing file system operations and reducing redundant logic.
  - Enhanced error handling in `FileWatcher` to provide clearer error messages and prevent unexpected crashes.
  - Updated `package.json` dependencies to remove unused packages and ensure compatibility with the latest VS Code APIs.

- Feature:
  - Introduced enhanced logging for debugging project-related issues, making it easier to identify and resolve problems.

---

## [v1.9.10]

- Fixed:

  - #66: **Keil project include path parsing issue**  
    Resolved an issue where the extension failed to correctly parse certain Keil project configurations, leading to incomplete include paths and build errors.
  - #67: **Unrecognized project types causing configuration errors**  
    Fixed a problem where the extension did not recognize specific project types, resulting in errors during parsing and updating project configurations.

- Optimized:

  - Improved the performance of the `findProject` method by reducing redundant file system operations and optimizing recursive directory traversal.
  - Enhanced error handling in `openProject` to provide clearer and more actionable error messages.
  - Streamlined `package.json` scripts by removing unused dependencies and improving build efficiency.

- Feature:
  - Added support for additional Keil project types, improving compatibility with a wider range of embedded projects.
  - Introduced better logging for debugging workspace and project-related issues, making it easier to identify and resolve problems.

---

## [v1.9.9]

- Fixed:

  - #63: Fixed an issue where the debug adapter reported "no available debug program" preventing the variables request from being sent. The debugger now correctly initializes and attaches to the target.
  - #64: Addressed redundant folding ranges requests from VS Code, reducing unnecessary processing and improving UI responsiveness.
  - #65: Resolved a problem with file URI handling during debug sessions (e.g., URIs with scheme 'file') which previously caused instability in path resolution.
  - #67: Fixed an issue where the extension failed to recognize certain project types, leading to errors in parsing and updating project configurations.

- Optimized:
  - Various improvements derived from the git diff changes, including enhancing event handling in key modules and refining resource mapping logic to further stabilize file and debug operations.

---

## [v1.9.8]

- Fixed:
  - #62: Fixed a bug where the extension would fail to update the c_cpp_properties.json file when the project contained multiple targets. This issue was caused by the incorrect handling of the targetInfo array during the update process.
- Optimized:
  - Refactored FileWatcher.ts to exclusively use chokidar's watch API for both file and directory monitoring. This change unifies event handling, reduces redundant resource usage, and improves overall stability.
  - Streamlined the package.json scripts by removing redundant installation calls (e.g., eliminating extra "yarn install" within the build commands) and simplifying build/publish workflows for a cleaner development experience.

---

## [v1.9.7]

- Optimized:
  - #57: Optimized the updateCppProperties method by caching the Array.from conversion of this.includes and this.defines, reducing redundant conversions to lower memory usage and boost performance.
  - #58: Refactored the assignment logic for includePath and defines to adopt a unified conversion strategy, enhancing code readability and maintainability.
  - #59: Performed comprehensive project refactoring to improve overall code structure, modularity, and performance.
  - #60: Improved the writing logic for c_cpp_properties.json to ensure a more efficient and stable update process.

---

## [v1.9.6]

- Fixed:
- #56 1.9.4 无法识别本地 Keil 工程 Error: open project TypeError: Cannot read properties of undefined (reading 'targetInfos')

---

## [v1.9.4]

- Fixed:
- remove RTE will inclue more header files; do not inclue its.

---

## [v1.9.3]

- Fixed:
- #41 RTE ARM Compiler include
- Added support for multi-language menus;
- V1.9.3+ version ⚠️ adjustment: VsCode supports the minimum version of vscode engines V1.73.0+, please update to V1.73.0 or later, this adjustment is because the minimum supported version of the multi-language version is 1.73.0; [**l10n** This API, introduced in VS Code 1.73](https://github.com/microsoft/vscode-l10n/blob/main/README.md)

---

## [v1.9.2]

- Fixed:
- #40 open project Error: This uVision project is not a C51 project, but have a 'uvproj' suffix !
- #39 Support ARM7 and ARM9 MCU
- #41 Support project custom include paths

---

## [v1.9.1]

- Fixed:
- #31 Optimized the dependency of the keil uVision assistant on other expansion packages

---

## [v1.9.0]

- Fixed:
- #25 #27 Build Error or Warning log cannot goto error file line number
- #26 keil projectx file in subdirectory will show include error and update includePath message.

---

## [v1.8.9]

- Fixed:
- #19 RTE macros import not form Non RTE project
- #17 Uv4 log out put show

---

## [v1.8.8]

- Fixed:
- RTE macros

---

## [v1.8.7]

- Fixed:
- Build log are garbled

---

## [v1.8.6]

- Fixed:
- Keil log out show

---

## [v1.8.5]

- Feature:
- #13 Arm Clang V6 Newer Versions Get the correct parameters for the built-in macros
- Added error highlighting and automatic redirection

---

## [v1.8.4]

- Fixed:
- #12 optimize Keil log out show

---

## [v1.8.3]

- Feature:
- Added support for regular extension packs

---

## [v1.8.2]

- Fixed: package signed error

---

## [v1.8.1]

- Fixed:
- #3 search sub folder project file
- #10 suppert \*.unmpw Project workspace

---

## [v1.8.0]

- Feature:
- #8 keil MDK/C51/C251 alone set Home PATH, Must reset PATH in settings
- setting show with l10n language
- #9 Support keil MDK RTE includes

---

## [v1.7.9]

- Fixed: #7 log out Chinese garbled characters

---

## [v1.7.8]

- Fixed: #5 vscode engines version to 1.74.0, #6 Arm clang genrate Macros

---

## [v1.7.7]

- Fixed: Include path for ARMCLANG with uvprojx

---

## [v1.7.6]

- Fixed: Include In Build icon is not show

---

## [v1.7.5]

- Fixed: include list for multiple targets

---

## [v1.7.4]

- Fixed: Log output channel mybe repeat show others log

---

## [v1.7.3]

- Optimize: Simplify keil configuration only use Keil installaction directory (C:\Keil_v5)
- Feature: Record the selection target

---

## [v1.7.2]

- Feature: support C251

---

## [v1.7.1]

- Fixed: can't use shortcut key

---

## [v1.7.0]

- Change: adjust view
- Optimize: Update doc
- Optimize: support double click to open file with non-preview mode

---

## [v1.6.2]

- Fixed: output messy code
- Optimize: extend more armcc keywords

---

## [v1.6.1]

- Fixed: error rebuild command

---

## [v1.6.0]

- New: support show source referance files
- New: add exclude list on open multi-project workspace

---

## [v1.5.0]

- New: add 'Active Target' button
- Changed: adjust keybindings

---

## [v1.4.0]

- New: support multi-target keil project
- New: add armclang cpp macros

---

## [v1.3.3]

- Optimize: extend more armcc keywords

---

## [v1.3.2]

- Fixed: some incorrect C51 keywords
- Fixed: some other bugs

---

## [v1.3.1]

- Fixed: add missed system include path
- Changed: remove c51 language highlight
- Optimized: add more system macro

---

## [v1.3.0]

- Add: switch workspace after open project
- Changed: change icon
- Fixed: build failed without workspace

---

## [v1.2.1]

- Add: Add some internal defines for ARM/C51

---

## [v1.2.0]

- Fixed: Can't run task by CMD
- Add: Shortcut keys

---

## [v1.1.0]

- Fixed: Not found C51/STM32 system include dir
- Fixed: Invalid macro

---

## [v1.0.0]

- First release
