/*
 * Photo manifest. One entry per photo, in gallery order.
 *
 *   id       used by `data-photo="<id>"` slots in the HTML pages
 *   file     file name inside assets/photos/
 *   alt      what the photo shows, for screen readers and search engines
 *   caption  short label shown in the gallery lightbox
 *   group    gallery section heading
 *   gallery  false keeps a photo off the gallery page
 *
 * A photo only renders when its file is listed in assets/js/photos-available.js
 * (tools/import-photos.sh keeps that list current). Missing photos show a
 * cream-and-green placeholder with the file name, so pages never break.
 *
 * Alt text marked "DRAFT" was written before the photo arrived. Check it
 * against the real photo and edit if needed.
 */
window.LUTTRELL_PHOTOS = [
  // Exterior
  {
    id: "exterior-east-side",
    file: "exterior-east-side.jpg",
    group: "Exterior",
    caption: "The Luttrell House and the new building behind it",
    alt: "Looking up at the pale yellow Victorian Luttrell House, with white-trimmed windows and a gabled roof, and the new multi-story residential building rising behind it under a clear blue sky.",
  },
  {
    id: "exterior-front-northeast",
    file: "exterior-front-northeast.jpg",
    group: "Exterior",
    caption: "Front of the property from the northeast",
    alt: "DRAFT: The front of The Luttrell on Channing Way, seen from the northeast.",
  },
  {
    id: "exterior-front-northwest",
    file: "exterior-front-northwest.jpg",
    group: "Exterior",
    caption: "Front of the property from the northwest",
    alt: "DRAFT: The front of The Luttrell on Channing Way, seen from the northwest.",
  },

  // Building
  {
    id: "keyless-building-entry",
    file: "keyless-building-entry.jpg",
    group: "Building",
    caption: "Keyless building entry",
    alt: "DRAFT: The building's front entrance with a keyless entry panel.",
  },
  {
    id: "hallway",
    file: "hallway.jpg",
    group: "Building",
    caption: "Hallway",
    alt: "DRAFT: A hallway outside the apartments in the new building.",
  },
  {
    id: "elevator",
    file: "elevator.jpg",
    group: "Building",
    caption: "Elevator",
    alt: "DRAFT: The building's elevator.",
  },
  {
    id: "laundry-room",
    file: "laundry-room.jpg",
    group: "Building",
    caption: "On-site laundry",
    alt: "DRAFT: The on-site laundry room with washers and dryers.",
  },
  {
    id: "keyless-unit-entry",
    file: "keyless-unit-entry.jpg",
    group: "Building",
    caption: "Keyless unit entry",
    alt: "DRAFT: An apartment front door with a keyless lock.",
  },

  // Apartment E3 (Layout 4)
  {
    id: "e3-bedroom-south-window",
    file: "e3-bedroom-south-window.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Private bedroom with south-facing window, unit E3",
    alt: "A furnished private bedroom with a full bed frame, desk and black office chair on wood-look floors, lit by a large south-facing window with views over Berkeley rooftops.",
  },
  {
    id: "e3-bedroom-bed-drawers",
    file: "e3-bedroom-bed-drawers.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Full bed with built-in drawers, unit E3",
    alt: "A full-size bed frame with two pairs of wood-front storage drawers built into its base, one drawer pulled open, in front of a large window.",
  },
  {
    id: "e3-bedroom-wardrobe-open",
    file: "e3-bedroom-wardrobe-open.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Wardrobe with hanging rail and shelves, unit E3",
    alt: "A tall white wardrobe with its doors open, showing a hanging rail on the left and five shelves on the right.",
  },
  {
    id: "e3-bedroom",
    file: "e3-bedroom.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Private bedroom, unit E3",
    alt: "DRAFT: A furnished private bedroom in unit E3.",
  },
  {
    id: "e3-bedroom-east-window",
    file: "e3-bedroom-east-window.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "East window, unit E3",
    alt: "DRAFT: A private bedroom in unit E3 with an east-facing window.",
  },
  {
    id: "e3-bedroom-desk",
    file: "e3-bedroom-desk.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Desk and chair, unit E3",
    alt: "DRAFT: A desk and chair in a private bedroom in unit E3.",
  },
  {
    id: "e3-bedroom-wardrobe",
    file: "e3-bedroom-wardrobe.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Wardrobe, unit E3",
    alt: "DRAFT: A closed white wardrobe in a private bedroom in unit E3.",
  },
  {
    id: "e3-kitchen",
    file: "e3-kitchen.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Full kitchen, unit E3",
    alt: "DRAFT: The full kitchen in unit E3.",
  },
  {
    id: "e3-kitchen-2",
    file: "e3-kitchen-2.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Kitchen, unit E3",
    alt: "DRAFT: Another view of the kitchen in unit E3.",
  },
  {
    id: "e3-bathroom",
    file: "e3-bathroom.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Bathroom, unit E3",
    alt: "DRAFT: One of the two bathrooms in unit E3.",
  },
  {
    id: "e3-front-door",
    file: "e3-front-door.jpg",
    group: "Apartment E3 · Layout 4",
    caption: "Front door, unit E3",
    alt: "DRAFT: The front door of unit E3.",
  },

  // Apartment B1 (Layout 1)
  {
    id: "b1-kitchen",
    file: "b1-kitchen.jpg",
    group: "Apartment B1 · Layout 1",
    caption: "Full kitchen, unit B1",
    alt: "DRAFT: The full kitchen in unit B1.",
  },
  {
    id: "b1-dining",
    file: "b1-dining.jpg",
    group: "Apartment B1 · Layout 1",
    caption: "Dining area, unit B1",
    alt: "DRAFT: The dining area in unit B1.",
  },
  {
    id: "b1-bedroom-1",
    file: "b1-bedroom-1.jpg",
    group: "Apartment B1 · Layout 1",
    caption: "Bedroom 1 (shared), unit B1",
    alt: "DRAFT: Bedroom 1 in unit B1, a shared room furnished for two.",
  },
  {
    id: "b1-bedroom-2",
    file: "b1-bedroom-2.jpg",
    group: "Apartment B1 · Layout 1",
    caption: "Bedroom 2 (private), unit B1",
    alt: "DRAFT: Bedroom 2 in unit B1, a private room.",
  },
  {
    id: "b1-bathroom",
    file: "b1-bathroom.jpg",
    group: "Apartment B1 · Layout 1",
    caption: "Bathroom, unit B1",
    alt: "DRAFT: The bathroom in unit B1.",
  },
];
