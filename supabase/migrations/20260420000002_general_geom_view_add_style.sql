-- Recreate general_geom_view to include c.style from general_geom_collection.
-- The style JSONB column drives per-collection map styling.
-- Must DROP first because CREATE OR REPLACE cannot reorder/insert columns.

DROP VIEW IF EXISTS "public"."general_geom_view";

CREATE VIEW "public"."general_geom_view" WITH ("security_invoker"='true') AS
 SELECT "g"."id",
    "g"."collection_id",
    "c"."label" AS "collection_label",
    "c"."feature_collection_type",
    "c"."region_id",
    "c"."visibility" AS "collection_visibility",
    "c"."style" AS "collection_style",
    "g"."type",
    "g"."subtype",
    "g"."visibility",
    "g"."label",
    "g"."description",
    "g"."created_at",
    "g"."updated_at",
    "g"."deleted_at",
    ("public"."st_asgeojson"("g"."geometry"))::json AS "geometry_geojson",
    "replace"("public"."st_geometrytype"("g"."geometry"), 'ST_'::"text", ''::"text") AS "geometry_type"
   FROM ("public"."general_geom" "g"
     JOIN "public"."general_geom_collection" "c" ON (("c"."id" = "g"."collection_id")))
  WHERE (("g"."deleted_at" IS NULL) AND ("c"."deleted_at" IS NULL));

ALTER VIEW "public"."general_geom_view" OWNER TO "postgres";

GRANT ALL ON TABLE "public"."general_geom_view" TO "anon";
GRANT ALL ON TABLE "public"."general_geom_view" TO "authenticated";
GRANT ALL ON TABLE "public"."general_geom_view" TO "service_role";
