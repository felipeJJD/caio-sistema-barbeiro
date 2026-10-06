import json
import sys
import duckdb

# Follow the release configured for the existing data source without changing its query.
from pathlib import Path
import runpy
source = runpy.run_path(str(Path(__file__).with_name("overture-search.py")))
RELEASE = source["RELEASE"]
DATASET = source["DATASET"]


def parse_float(value, label):
    try:
        return float(value)
    except Exception as exc:
        raise SystemExit(f"{label} inválido: {value}") from exc


def main():
    if len(sys.argv) < 5:
        raise SystemExit("uso: instagram-search.py west south east north [limit] [offset] [name] [city]")

    west = parse_float(sys.argv[1], "west")
    south = parse_float(sys.argv[2], "south")
    east = parse_float(sys.argv[3], "east")
    north = parse_float(sys.argv[4], "north")
    limit = int(sys.argv[5]) if len(sys.argv) > 5 else 41
    offset = int(sys.argv[6]) if len(sys.argv) > 6 else 0
    name_filter = str(sys.argv[7]).strip()[:80] if len(sys.argv) > 7 else ""
    city_filter = str(sys.argv[8]).strip()[:90] if len(sys.argv) > 8 else ""
    name_tokens = [token for token in name_filter.lower().split() if len(token) >= 2][:8]
    limit = max(1, min(limit, 101))
    offset = max(0, min(offset, 100000))

    con = duckdb.connect(database=":memory:")
    try:
        try:
            con.execute("LOAD httpfs")
        except Exception:
            con.execute("INSTALL httpfs")
            con.execute("LOAD httpfs")

        con.execute("SET s3_region='us-west-2'")
        name_conditions = "".join("\n                AND lower(names.primary) LIKE ?" for _ in name_tokens)
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
                AND (lower(CAST(socials AS VARCHAR)) LIKE '%instagram.com/%'
                     OR lower(CAST(websites AS VARCHAR)) LIKE '%instagram.com/%')
                AND (? = '' OR addresses IS NULL OR len(addresses) = 0
                     OR list_contains(list_transform(addresses, a -> lower(strip_accents(a.locality))), lower(strip_accents(?))))
                AND (operating_status IS NULL OR operating_status <> 'permanently_closed')
                AND (confidence IS NULL OR confidence >= 0.35){name_conditions}
            ORDER BY
                confidence DESC NULLS LAST,
                names.primary,
                id
            LIMIT {limit}
            OFFSET {offset}
        """
        params = [west, east, south, north, city_filter, city_filter, *[f"%{token}%" for token in name_tokens]]
        rows = con.execute(query, params).fetchall()

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

        print(json.dumps({
            "release": RELEASE,
            "offset": offset,
            "limit": limit,
            "name": name_filter,
            "places": results,
        }, ensure_ascii=False))
    finally:
        con.close()


if __name__ == "__main__":
    main()
