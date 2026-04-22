{
  "targets": [
    {
      "target_name": "tags_manager_fileid",
      "sources": [ "fileid.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        [ "OS==\"win\"", { "defines": [ "NOMINMAX" ] } ]
      ]
    }
  ]
}

