// Rules for meal photos: no DOM and no storage in the rules themselves, so they can be tested.
// A photo is only a picture to look at; nothing reads or scans it.

export const MAX_PHOTO_SIDE = 800;
export const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;

// What is wrong with a chosen file, or null when it can be used as a meal photo.
export function validatePhotoFile(file) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) return 'Please choose a photo (an image file).';
  if (file.size > MAX_PHOTO_FILE_BYTES) return 'That photo is too large. Choose one under 25 MB.';
  return null;
}

// The size a photo is shrunk to: its longest side becomes at most `maxSide`, keeping its shape.
// A photo that is already small enough keeps its size.
export function shrunkSize(width, height, maxSide = MAX_PHOTO_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// The photo ids still in use by a list of meals.
export function usedPhotoIds(meals) {
  return new Set(meals.map((meal) => meal.photoId).filter((id) => typeof id === 'string' && id !== ''));
}

// Which saved photo ids no meal uses any more, so they can be deleted.
export function unusedPhotoIds(savedIds, meals) {
  const used = usedPhotoIds(meals);
  return savedIds.filter((id) => !used.has(id));
}

// Shrinks a chosen image file to a JPEG Blob (a few hundred KB at most) so many photos fit in the
// browser's storage. Rejects with a plain Error that is safe to show.
export async function shrinkPhoto(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That file could not be opened as a photo. Try a JPG or PNG.');
  }
  const { width, height } = shrunkSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('That photo could not be prepared. Try a different one.');
  return blob;
}
