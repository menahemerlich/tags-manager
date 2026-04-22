#include <napi.h>

#if defined(_WIN32)
#define NOMINMAX
#include <windows.h>
#include <fileapi.h>
#endif

static Napi::Value GetFileId(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected (path: string)").ThrowAsJavaScriptException();
    return env.Null();
  }

#if !defined(_WIN32)
  // FileID is Windows-specific in this app layer; return null on other platforms.
  return env.Null();
#else
  std::u16string path16 = info[0].As<Napi::String>().Utf16Value();

  HANDLE h = CreateFileW(
      (LPCWSTR)path16.c_str(),
      FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      NULL,
      OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL,
      NULL);

  if (h == INVALID_HANDLE_VALUE) {
    return env.Null();
  }

  BY_HANDLE_FILE_INFORMATION finfo;
  BOOL ok = GetFileInformationByHandle(h, &finfo);
  CloseHandle(h);
  if (!ok) {
    return env.Null();
  }

  Napi::Object out = Napi::Object::New(env);
  out.Set("volumeSerialNumber", Napi::Number::New(env, (double)finfo.dwVolumeSerialNumber));
  out.Set("fileIndexHigh", Napi::Number::New(env, (double)finfo.nFileIndexHigh));
  out.Set("fileIndexLow", Napi::Number::New(env, (double)finfo.nFileIndexLow));
  return out;
#endif
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getFileId", Napi::Function::New(env, GetFileId));
  return exports;
}

NODE_API_MODULE(tags_manager_fileid, Init)

