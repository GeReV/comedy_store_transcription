# Comedy Store Transciption

This repo contains a [https://github.com/ggml-org/whisper.cpp] transcription of (as far as I can tell) all episodes of the [Comedy Store](https://he.wikipedia.org/wiki/%D7%94%D7%A7%D7%95%D7%9E%D7%93%D7%99_%D7%A1%D7%98%D7%95%D7%A8).

The intention is to make the episodes and quotes searchable in the future.

Each episode has its own folder containing the following:

- An SRT subtitles file
- A JSON file containing raw output from whisper.cpp
- An XML file containing chapter information that can be handled by [MKVToolNix](https://mkvtoolnix.download/)

The transcriptions and chapters were extracted using automated tools and as such contain many mistakes.

The chapters were extracted using an FFMPEG filter which recognizes mostly camera cuts, so single scenes will be split.

If anyone would like to contribute, feel free to build upon this and/or send pull requests.

## Future work

- Add tools for editing transcriptions?
- Add tools for merging chapters?
