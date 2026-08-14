-- Optional dotted keys for nested label/value extraction from external API
-- option items (TKT-010).

ALTER TABLE "OptionSet" ADD COLUMN "apiLabelKey" TEXT;
ALTER TABLE "OptionSet" ADD COLUMN "apiValueKey" TEXT;
