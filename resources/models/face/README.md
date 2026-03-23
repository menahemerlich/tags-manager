Place SCRFD + ArcFace ONNX files in this directory:

- `scrfd.onnx`
- `arcface.onnx`

These files are loaded by `src/main/faceEngine.ts` and packaged with the app build.

Notes:
- The repository keeps only placeholders to avoid bloating git history.
- At runtime, if files are missing, the app will report a clear error in the Face tab.
