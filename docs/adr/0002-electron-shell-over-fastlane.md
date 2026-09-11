# Electron is a desktop shell over Fastlane

Electro keeps Fastlane as the build/upload engine; Electron only provides a desktop UI that invokes existing lanes (progress, logs, results). Rejected rewriting lanes into Node now, and a dual-track migration, to stay aligned with ADR 0001 and validate the GUI before changing the pipeline core.
