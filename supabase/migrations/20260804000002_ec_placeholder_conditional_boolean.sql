-- Adds real conditional/boolean placeholder support to ec_placeholders,
-- reusing the exact same shape tasks-requirements' acc_portal_templates
-- placeholders already use (type/conditions/boolean_conditions), so
-- masterFieldResolver.ts can call the SAME, already-hardened
-- processConditionalField/processBooleanField from
-- tasks-requirements/utils/placeholderProcessors.ts instead of a second
-- reimplementation. Previously (see 20260729000001's comment) type/
-- conditions/boolean_conditions were explicitly NOT persisted here even
-- though the reused PlaceholderFormDialog UI could configure them - this
-- closes that gap.
--
-- type mirrors DTM's placeholder.type values but only 'text'/'conditional'/
-- 'boolean' are meaningful for EC (no image/document_checklist/ordinal
-- source in this module's data model).
ALTER TABLE ec_placeholders
  ADD COLUMN type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'conditional', 'boolean')),
  ADD COLUMN conditions JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN boolean_conditions JSONB NOT NULL DEFAULT '[]'::JSONB;
