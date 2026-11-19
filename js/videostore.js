// Uploaded step videos, kept with the shared file store in blobstore.js.
import { createBlobStore } from './blobstore.js';

// The database keeps its original name and layout so videos saved earlier are still found.
const videos = createBlobStore('engarde_videos', 'videos', 'video');

export const saveVideo = videos.save;
export const loadVideo = videos.load;
export const deleteVideo = videos.remove;
export const deleteProfileVideos = videos.removeProfile;
