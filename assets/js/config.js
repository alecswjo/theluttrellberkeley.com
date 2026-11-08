/*
 * The Luttrell — site settings. This is the one file to edit for contact links,
 * prices and availability. See README.md for details.
 */
window.LUTTRELL = {
  EMAIL: "leasing@theluttrellberkeley.com",

  // Leave empty to hide every phone link on the site. Example: "(510) 555-0123"
  PHONE: "",

  // Where the "Apply Now" and "Book a Tour" buttons go. Swap in a Google Form
  // (or any URL) when one exists. Until then they open a pre-filled email.
  APPLY_URL:
    "mailto:leasing@theluttrellberkeley.com?subject=" +
    encodeURIComponent("Application — The Luttrell"),
  TOUR_URL:
    "mailto:leasing@theluttrellberkeley.com?subject=" +
    encodeURIComponent("Tour request — The Luttrell"),

  // Show labeled placeholders for photos that haven't been added yet.
  // When false, missing photos are hidden everywhere (gallery and page photo slots).
  SHOW_GALLERY_PLACEHOLDERS: false,

  // Announcement bar at the top of every page. Set `enabled: false` to hide it.
  // Change `id` whenever the text changes so visitors who closed the old one see the new one.
  ANNOUNCEMENT: {
    enabled: true,
    id: "leasing-2027",
    text: "Now leasing for Spring & Fall 2027.",
    linkText: "See floor plans",
    href: "floorplans.html",
  },

  /*
   * Prices per bed, per month, keyed by floor plan id.
   *   private: price for a private bedroom
   *   shared:  price per person in a shared bedroom (null = this plan has no shared rooms)
   * Use a string such as "$1,850" or "From $1,850". Leave "" to show "Contact for pricing".
   */
  PRICING: {
    "layout-1": { private: "", shared: "" },
    "layout-2": { private: "", shared: "" },
    "layout-3": { private: "", shared: null },
    "layout-4": { private: "", shared: null },
    "luttrell-house": { private: "", shared: "" },
  },

  /*
   * Availability labels shown on each floor plan card, keyed by floor plan id.
   * Each entry is a list of short labels, e.g. ["Spring 2027 available", "Fall 2027"].
   * An empty list shows "Contact for availability".
   */
  AVAILABILITY: {
    "layout-1": ["Spring 2027", "Fall 2027"],
    "layout-2": ["Spring 2027", "Fall 2027"],
    "layout-3": ["Spring 2027", "Fall 2027"],
    "layout-4": ["Spring 2027", "Fall 2027"],
    "luttrell-house": ["Spring 2027", "Fall 2027"],
  },
};
