// Sound is a backend concern only as an event: entities request a named effect,
// the frontend (or nothing, in CLI) plays it. Keeps the sim free of Web Audio.

export type SfxName = 'pour' | 'sip' | 'bark' | 'toilet' | 'cheers' | 'footstep';
