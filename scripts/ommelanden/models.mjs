// Tenant content definitions, not PostgreSQL tables. Existing keys are intentional.
const field = (key, label, type = "text", extra = {}) => ({
  key, label, type, required: false, config: {}, isTitle: false, ...extra,
});
const title = () => field("title", "Title", "text", { required: true, isTitle: true });
const slug = (required = true) => field("slug", "Slug", "slug", { required, config: { unique: true } });
const legacyId = () => field("legacy_id", "Legacy ID", "number");
const image = () => field("image", "Image", "asset");
const rich = (key = "content", label = "Content", required = false) => field(key, label, "rich_text", {
  required,
  config: { richText: { code: true, links: true, lists: true, media: true, quotes: true, headings: true } },
});
const reference = (key, label, targets, isList = true, required = false) => field(key, label, "component", {
  required, config: { targetModelSlugs: targets, isList },
});
const dropdown = (key, label, options, required = false) => field(key, label, "enum", { required, config: { options } });

// Index matches Admin::Page#templates. Values preserve the old frontend contract.
export const pageTemplates = [
  ["Homepage", "homepage"], ["Content", "content"], ["Contact", "contact"],
  ["Afspraken", "afspraken"], ["Niet gevonden", "niet-gevonden"],
  ["Specialisaties overzicht", "specialisaties-overzicht"], ["Over ons", "over-ons"],
  ["Trainingen overzicht", "trainingen-overzicht"], ["Klachten", "klachten"],
  ["Locatie overzicht", "locatie-overzicht"], ["Afspraak maken", "afspraak-maken"],
  ["Afspraak afzeggen", "afspraak-afzeggen"], ["Egym", "egym"],
].map(([label, value]) => ({ label, value }));

export const models = [
  { slug: "employee", name: "Personeel", fields: [
    field("firstname", "First name", "text", { required: true }),
    field("prefix", "Prefix"), field("lastname", "Last name"),
    field("email", "Email", "text", { isTitle: true }),
    field("big", "BIG registration number"), field("secretary", "Secretariaat", "boolean"),
    rich("description", "Description"), image(), slug(false), legacyId(),
  ] },
  { slug: "experience", name: "Experiences", fields: [
    field("name", "Naam", "text", { required: true, isTitle: true }),
    field("locatie", "Location", "text", { required: true }),
    field("content", "Content", "text", { required: true }), legacyId(),
  ] },
  { slug: "location", name: "Location", fields: [
    title(), field("name", "Location name"), field("street", "Street"),
    field("number", "House number"), field("zipcode", "Postcode"), field("city", "City"),
    field("color", "Color"), reference("employees", "Employees", ["employee"]),
    slug(), field("longitude", "Longitude", "number"), field("latitude", "Latitude", "number"),
    field("note", "Location note"), field("walkin", "Walk-in information"),
    ...[["mo", "Monday"], ["tu", "Tuesday"], ["we", "Wednesday"], ["th", "Thursday"],
      ["fr", "Friday"], ["sa", "Saturday"], ["su", "Sunday"]].flatMap(([day, label]) => [
      field(`o_${day}_open`, `${label} opens`, "time"), field(`o_${day}_close`, `${label} closes`, "time"),
    ]),
    reference("specialties", "Specialties", ["specialty"]), legacyId(),
  ] },
  { slug: "specialty", name: "Specialty", fields: [
    title(), rich(), image(), slug(), reference("employees", "Employees", ["employee"]), legacyId(),
  ] },
  { slug: "training", name: "Training", fields: [title(), rich(), image(), slug(), legacyId()] },
  { slug: "issue", name: "Klachten", fields: [
    title(), field("part", "Short name", "text", { required: true }), slug(),
    field("short", "Summary"), rich("content", "Content", true), image(),
    field("order", "Display order", "number"), field("legacy_stub", "Legacy link (unused)"), legacyId(),
  ] },
  { slug: "group", name: "Klachtgroepen", fields: [
    title(), field("part", "Short name", "text", { required: true }), slug(),
    field("short", "Summary", "text", { required: true }), rich("content", "Content", true), image(),
    field("order", "Display order", "number"),
    reference("items", "Related treatments and complaints", ["training", "specialty", "issue", "group"]), legacyId(),
  ] },
  { slug: "blog", name: "Blogs", fields: [
    title(), slug(), rich("intro", "Introduction"), rich(), image(),
    field("author", "Author name"), field("date", "Publication date", "date"),
    field("meta", "Meta description"), legacyId(),
  ] },
  { slug: "page", name: "Page", fields: [
    title(), slug(), dropdown("template", "Template", pageTemplates, true), image(),
    reference("content", "Content", ["specialty_block", "trainings_block", "text_content"]),
    field("homepage", "Homepage", "boolean"), legacyId(),
  ] },
  { slug: "menu", name: "Menu", fields: [
    reference("items", "Items", ["menu_item"], true, true),
    dropdown("type", "Type", [{ label: "Header", value: "header" }, { label: "Footer", value: "footer" }]),
    field("internal_name", "Internal name", "text", { required: true, isTitle: true }),
  ] },
  { slug: "menu_item", name: "Menu Item", fields: [
    title(), reference("target", "Target", ["page"], false), field("external_target", "External target", "url"),
    reference("children", "Submenu items", ["menu_item"]), legacyId(),
  ] },
  { slug: "text_content", name: "Text Content", fields: [
    field("internal_name", "Internal name", "text", { isTitle: true }), rich(),
  ] },
  // Empty selection means all entries; the future frontend implements that behavior.
  { slug: "specialty_block", name: "Specialisaties Block", fields: [
    field("title", "Heading", "text", { isTitle: true }), reference("items", "Specialties", ["specialty"]),
  ] },
  { slug: "trainings_block", name: "Trainingen Block", fields: [
    field("title", "Heading", "text", { isTitle: true }), reference("items", "Trainings", ["training"]),
  ] },
];
