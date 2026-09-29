from pathlib import Path


def replace_once(path, before, after):
    p = Path(path)
    source = p.read_text()
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}")
    p.write_text(source.replace(before, after, 1))

# Um Pix cancelado não pode virar Agendado só porque o horário foi remarcado.
# Se o cliente ainda nem informou o pagamento, volta a Aguardando pagamento;
# se já informou, volta a Aguardando para nova conferência do proprietário.
replace_once(
    'db/dashboard.ts',
    '  // Editing or rescheduling must not approve a pending request or a Pix payment.\n  const values = { appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime, clientName, phone: input.phone ?? "", serviceId: input.serviceId, barberId: input.barberId, notes: input.notes ?? "", status: existing && existing.status !== "Cancelado" ? existing.status : "Agendado", reminderSentAt: null };\n',
    '  // Editing or rescheduling must not approve a pending request or a Pix payment.\n  const restoredStatus = existing?.status === "Cancelado" && existing.paymentChoice === "Pix"\n    ? (existing.paymentConfirmationToken ? "Aguardando pagamento" : "Aguardando")\n    : existing && existing.status !== "Cancelado" ? existing.status : "Agendado";\n  const values = { appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime, clientName, phone: input.phone ?? "", serviceId: input.serviceId, barberId: input.barberId, notes: input.notes ?? "", status: restoredStatus, reminderSentAt: null };\n'
)

# Fortalece o contrato estático da Agenda para impedir regressão de Pix em remarcação.
p = Path('tests/agenda-ca-context-upgrade.test.mjs')
source = p.read_text()
needle = '''test("remarcação preserva dados e reaproveita validação central", () => {
  const block = dashboard.slice(dashboard.indexOf("export async function rescheduleAppointmentFromAgenda"), dashboard.indexOf("export async function cancelAppointment"));
  assert.match(block, /serviceId: existing\.serviceId/);
  assert.match(block, /clientName: existing\.clientName/);
  assert.match(block, /saveAppointment\(access/);
});
'''
replacement = needle + '''\ntest("remarcar Pix cancelado nunca aprova pagamento automaticamente", () => {
  assert.match(dashboard, /existing\?\.status === "Cancelado" && existing\.paymentChoice === "Pix"/);
  assert.match(dashboard, /paymentConfirmationToken \? "Aguardando pagamento" : "Aguardando"/);
});
'''
if source.count(needle) != 1:
    raise RuntimeError(f'Teste de remarcação esperado 1 vez, encontrado {source.count(needle)}')
p.write_text(source.replace(needle, replacement, 1))

# Testes de conversa real, não apenas inspeção de código.
p = Path('tests/ca-atende-master-scenarios.test.mjs')
source = p.read_text()
anchor = '''test("sem serviço combinado, não reserva só barba ou só corte",async()=>{
  const shop={...context,services:context.services.filter(item=>item.id!==13)};
  const [reply]=await chat(["Corte mais barba"],shop);
  assert.equal(reply.state,"awaiting_service");
  assert.equal(reply.memory.service,"");
  assert.match(reply.reply,/não encontrei corte com barba/i);
  assert.equal(globalThis.__caSlots.length,0);
});
'''
extra = anchor + '''\ntest("negação de barba mantém somente corte e nunca seleciona o combo",async()=>{
  const [reply]=await chat(["quero corte sem barba amanhã às 10 com Eduardo"]);
  assert.equal(reply.memory.service,"Corte");
  assert.equal(reply.memory.barber,"Eduardo");
  assert.equal(reply.memory.time,"10:00");
  assert.ok(globalThis.__caSlots.some(slot=>slot.serviceId===11));
  assert.ok(!globalThis.__caSlots.some(slot=>slot.serviceId===13));
});

test("correção 'barba não quero só o cabelo' troca só o serviço e preserva contexto",async()=>{
  const [first,second]=await chat(["quero corte + barba amanhã às 10 com Eduardo","barba não quero só o cabelo"]);
  assert.equal(first.memory.service,"Corte + barba");
  assert.equal(second.memory.service,"Corte");
  assert.equal(second.memory.date,first.memory.date);
  assert.equal(second.memory.barber,"Eduardo");
  assert.equal(second.memory.time,"10:00");
});

test("correção 'na verdade às 11' muda só o horário",async()=>{
  const [first,second]=await chat(["quero corte amanhã às 10 com Eduardo","na verdade às 11"]);
  assert.equal(second.memory.service,"Corte");
  assert.equal(second.memory.date,first.memory.date);
  assert.equal(second.memory.barber,"Eduardo");
  assert.equal(second.memory.time,"11:00");
});
'''
if source.count(anchor) != 1:
    raise RuntimeError(f'Âncora master esperada 1 vez, encontrado {source.count(anchor)}')
p.write_text(source.replace(anchor, extra, 1))

print('Proteções adicionais aplicadas.')
