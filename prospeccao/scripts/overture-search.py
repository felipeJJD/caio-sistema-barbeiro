import json
import sys
import duckdb

RELEASE = "2026-09-23.1"
DATASET = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"


def parse_float(value, label):
    try:
        return float(value)
    except Exception as exc:
        raise SystemExit(f"{label} inválido: {value}") from exc


def main():
    if len(sys.argv) < 5:
        raise SystemExit("uso: overture-search.py west south east north [limit]")

    west = parse_float(sys.argv[1], "west")
    south = parse_float(sys.argv[2], "south")
    east = parse_float(sys.argv[3], "east")
    north = parse_float(sys.argv[4], "north")
    limit = int(sys.argv[5]) if len(sys.argv) > 5 else 160
    limit = max(1, min(limit, 300))

    con = duckdb.connect(database=":memory:")
    try:
        try:
            con.execute("LOAD httpfs")
        except Exception:
            con.execute("INSTALL httpfs")
            con.execute("LOAD httpfs")

        con.execute("SET s3_region='us-west-2'")
        query = f"""
            SELECT
                id,
                names.primary AS name,
                taxonomy.primary AS category,
                confidence,
                operating_status,
                CAST(phones AS JSON) AS phones_json,
                CAST(addresses AS JSON) AS addresses_json,
                CAST(websites AS JSON) AS websites_json,
                CAST(socials AS JSON) AS socials_json,
                bbox.xmin AS lon,
                bbox.ymin AS lat
            FROM read_parquet('{DATASET}', filename=true, hive_partitioning=1)
            WHERE
                bbox.xmin BETWEEN ? AND ?
                AND bbox.ymin BETWEEN ? AND ?
                AND (
                    taxonomy.primary = 'barber'
                    OR list_contains(taxonomy.hierarchy, 'barber')
                    OR basic_category = 'barber'
                )
                AND names.primary IS NOT NULL
                AND (operating_status IS NULL OR operating_status <> 'permanently_closed')
                AND (confidence IS NULL OR confidence >= 0.35)
            ORDER BY
                CASE WHEN phones IS NULL THEN 1 ELSE 0 END,
                confidence DESC NULLS LAST,
                names.primary
            LIMIT {limit}
        """
        rows = con.execute(query, [west, east, south, north]).fetchall()

        results = []
        for row in rows:
            (place_id, name, category, confidence, operating_status,
             phones_json, addresses_json, websites_json, socials_json, lon, lat) = row
            results.append({
                "id": place_id,
                "name": name,
                "category": category,
                "confidence": confidence,
                "operatingStatus": operating_status,
                "phones": json.loads(phones_json) if phones_json else [],
                "addresses": json.loads(addresses_json) if addresses_json else [],
                "websites": json.loads(websites_json) if websites_json else [],
                "socials": json.loads(socials_json) if socials_json else [],
                "lon": lon,
                "lat": lat,
            })

        print(json.dumps({"release": RELEASE, "places": results}, ensure_ascii=False))
    finally:
        con.close()


if __name__ == "__main__":
    main()
