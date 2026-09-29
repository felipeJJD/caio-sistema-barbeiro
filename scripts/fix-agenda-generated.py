from pathlib import Path
p = Path('app/ui/dashboard-app.tsx')
source = p.read_text()
before = '    const payload = editing\n'
after = '    const payload: Record<string, string | number | boolean> = editing\n'
if source.count(before) != 1:
    raise RuntimeError(f'Trecho payload esperado 1 vez, encontrado {source.count(before)}')
p.write_text(source.replace(before, after, 1))
