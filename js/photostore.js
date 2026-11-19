// Meal photos, kept with the shared file store in blobstore.js.
import { createBlobStore } from './blobstore.js';

const photos = createBlobStore('engarde_photos', 'photos', 'photo');

export const savePhoto = photos.save;
export const loadPhoto = photos.load;
export const deletePhoto = photos.remove;
export const listPhotoIds = photos.listIds;
export const deleteProfilePhotos = photos.removeProfile;
