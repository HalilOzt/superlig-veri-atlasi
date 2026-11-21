"""Build the browser snapshot from the Süper Lig workbook and optional Football-Data CSVs."""
import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import openpyxl

IDS = {
    'Eskisehirspor':3,'Karabukspor':4,'Elazigspor':37,'Kasimpasa':39,'Alanyaspor':51,'Antalyaspor':52,
    'Erciyesspor':71,'Kayserispor':72,'Sivasspor':74,'Denizlispor':81,'Akhisar Belediyespor':85,
    'Manisaspor':110,'Gaziantepspor':116,'Mersin Idman Yurdu':118,'Hatayspor':121,'Kocaelispor':132,
    'Balikesirspor':135,'Corum':3199,'Besiktas':3590,'Altay':3591,'Fenerbahce':3592,'Ankaragucu':3595,
    'Trabzonspor':3596,'Samsunspor':3597,'Konyaspor':3600,'Bursaspor':3601,'Ad. Demirspor':3603,
    'Galatasaray':3604,'Adanaspor':3605,'Genclerbirligi':3606,'Eyupspor':3610,'Karagumruk':3611,
    'Istanbulspor':3617,'Pendikspor':3623,'Giresunspor':3629,'Orduspor':3630,'Rizespor':3631,
    'Umraniyespor':3661,'Buyuksehyr':3665,'Gaziantep':3672,'Amedspor':3678,'Goztep':3688,
    'Erzurumspor':4123,'Erzurum BB':4123,'Osmanlispor':4355,'Bodrumspor':4824,'Yeni Malatyaspor':4879,
}

def number(value):
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None

def supplemental(directory):
    if not directory:
        return {}
    data = {}
    fields = [('HxG','AxG'),('HS','AS'),('HST','AST'),('HC','AC'),('HF','AF'),('HY','AY'),('HR','AR')]
    for path in sorted(directory.glob('fd-*.csv')):
        try:
            source = path.read_text(encoding='utf-8-sig')
        except UnicodeDecodeError:
            source = path.read_text(encoding='cp1252')
        for row in csv.DictReader(source.splitlines()):
            date, home, away = row.get('Date'), IDS.get(row.get('HomeTeam')), IDS.get(row.get('AwayTeam'))
            if not date or not home or not away:
                continue
            try:
                when = datetime.strptime(date.strip(), '%d/%m/%Y' if len(date.strip()) == 10 else '%d/%m/%y')
            except ValueError:
                continue
            data[(when.date().isoformat(), home, away)] = [[number(row.get(a)), number(row.get(b))] for a,b in fields]
    return data

def rows(workbook, sheet):
    return workbook[sheet].iter_rows(min_row=5, values_only=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--football-data', type=Path)
    parser.add_argument('--output', type=Path, default=Path('dist/data.json'))
    args = parser.parse_args()
    workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    names = {}
    teams = []
    for row in rows(workbook, 'Takım Toplamları'):
        name, team, seasons, matches, normal, final, points, links = row
        names[name] = team
        teams.append({'id':team,'name':name,'seasons':seasons,'matches':matches,'points':points,'links':links})
    source = supplemental(args.football_data)
    matches = []
    for r in rows(workbook, 'Maçlar'):
        team, rival, date = names[r[6]], names[r[7]], r[4].date().isoformat()
        extra = source.get((date,team,rival), [[None,None] for _ in range(7)])
        if r[10] == 'Hükmen · oynanmadı':
            extra = [[None,None] for _ in range(7)]
        matches.append({
            'id':r[0],'season':r[1],'date':date,'home':team,'away':rival,'goals':[r[8], r[9]],
            'status':r[10],'city':r[12],'stadium':r[11],'temp':r[14], 'squad':[r[19],r[24]],
            'eleven':[r[20],r[25]],'odds':list(r[29:32]),'prob':list(r[33:36]),
            'advanced':extra,
        })
    stocks = defaultdict(list)
    for r in rows(workbook, 'Hisseler'):
        stocks[r[2]].append([r[0].date().isoformat(), r[6], r[8]])
    seasons = defaultdict(dict)
    for r in rows(workbook, 'Sezon Puanları'):
        record = seasons[r[0]].setdefault(names[r[1]], [0,0])
        record[0] += r[13]
        record[1] += r[14]
    links = [[names[r[0]],*r[1:]] for r in rows(workbook,'Şirket Bağlantıları')]
    data = {'start':'2011-11-20','end':'2026-11-20','teams':teams,'matches':matches,'seasons':seasons,
            'stocks':stocks,'links':links}
    assert len(teams) == 46 and len(matches) == 4953 and len(links) == 55
    print(f'{len(matches)} matches, {sum(all(v is not None for v in m["advanced"][0]) for m in matches)} with xG')
    args.output.parent.mkdir(exist_ok=True,parents=True)
    args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')

if __name__ == '__main__':
    main()
