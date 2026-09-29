from pathlib import Path

# O payload da Agenda é deliberadamente dinâmico, mas sempre contém apenas valores escalares aceitos pelo post().
p = Path('app/ui/dashboard-app.tsx')
source = p.read_text()
before = '    const payload = editing\n'
after = '    const payload: Record<string, string | number | boolean> = editing\n'
if source.count(before) != 1:
    raise RuntimeError(f'Trecho payload esperado 1 vez, encontrado {source.count(before)}')
p.write_text(source.replace(before, after, 1))

# IMPORTANTE: no motor atual, campos vazios vindos do interpretador significam "nenhuma informação nova".
# Portanto não podemos tratar string vazia como uma ordem global para apagar a memória: isso faria cada turno
# perder data/horário/serviço/profissional. Limpezas intencionais continuam sendo feitas nos estados específicos.
p = Path('lib/ca-atende.ts')
source = p.read_text()
generated = '''export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent !== undefined ? next.intent : (memory.intent || ""),
    date: next.date !== undefined ? next.date : (memory.date || ""),
    time: next.time !== undefined ? next.time : (memory.time || ""),
    service: next.service !== undefined ? next.service : (memory.service || ""),
    barber: next.barber !== undefined ? next.barber : (memory.barber || ""),
    clientName: next.clientName !== undefined ? next.clientName : (memory.clientName || ""),
    paymentChoice: next.paymentChoice !== undefined ? next.paymentChoice : (memory.paymentChoice || ""),
    appointmentId: next.appointmentId !== undefined ? next.appointmentId : (memory.appointmentId || 0),
    manageAction: next.manageAction !== undefined ? next.manageAction : (memory.manageAction || ""),
    afterTime: next.afterTime !== undefined ? next.afterTime : (memory.afterTime || ""),
    beforeTime: next.beforeTime !== undefined ? next.beforeTime : (memory.beforeTime || ""),
  };
}
'''
original = '''export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent || memory.intent || "",
    date: next.date || memory.date || "",
    time: next.time || memory.time || "",
    service: next.service || memory.service || "",
    barber: next.barber || memory.barber || "",
    clientName: next.clientName || memory.clientName || "",
    paymentChoice: next.paymentChoice || memory.paymentChoice || "",
    appointmentId: next.appointmentId !== undefined ? next.appointmentId : (memory.appointmentId || 0),
    manageAction: next.manageAction !== undefined ? next.manageAction : (memory.manageAction || ""),
    afterTime: next.afterTime || memory.afterTime || "",
    beforeTime: next.beforeTime || memory.beforeTime || "",
  };
}
'''
if source.count(generated) != 1:
    raise RuntimeError(f'Merge gerado esperado 1 vez, encontrado {source.count(generated)}')
p.write_text(source.replace(generated, original, 1))

# Ajusta o teste novo para proteger a semântica existente: vazio não apaga contexto por acidente.
p = Path('tests/agenda-ca-context-upgrade.test.mjs')
source = p.read_text()
before = '''test("memória aceita limpar apenas o campo corrigido", () => {
  assert.match(memory, /next\\.barber !== undefined/);
  assert.match(memory, /next\\.service !== undefined/);
  assert.match(memory, /next\\.time !== undefined/);
});
'''
after = '''test("memória preserva contexto quando o interpretador não traz valor novo", () => {
  assert.match(memory, /next\\.barber \\|\\| memory\\.barber/);
  assert.match(memory, /next\\.service \\|\\| memory\\.service/);
  assert.match(memory, /next\\.time \\|\\| memory\\.time/);
});
'''
if source.count(before) != 1:
    raise RuntimeError(f'Teste de memória esperado 1 vez, encontrado {source.count(before)}')
p.write_text(source.replace(before, after, 1))
