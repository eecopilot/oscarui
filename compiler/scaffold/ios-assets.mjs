export function emitAssetCatalogContents() {
  return `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

export function emitAppIconContents(filename) {
  return `{
  "images" : [
    {
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"${filename ? `,\n      "filename" : "${filename}"` : ''}
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

export function emitLaunchImageContents(filename) {
  return `{
  "images" : [
    {
      "filename" : "${filename}",
      "idiom" : "universal",
      "scale" : "1x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

export function emitAccentColorContents() {
  return `{
  "colors" : [
    {
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}
