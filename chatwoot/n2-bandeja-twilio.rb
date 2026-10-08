# N2 (PLAN-NOCHE): bandeja de WhatsApp por Twilio con credenciales FALSAS en el Chatwoot local,
# más un Agent Bot de captura que reenvía cada evento a un receptor en el host.
# Se crea directo en el modelo: el endpoint de la API autentica contra Twilio real y fallaría.
# Idempotente. No toca el Agent Bot de la demo ni su bandeja.

cuenta = Account.find_by!(name: ENV.fetch('CHATWOOT_CUENTA'))
sid = 'AC00000000000000000000000000000000'
numero = 'whatsapp:+15005550006'

canal = Channel::TwilioSms.find_or_initialize_by(account_sid: sid, phone_number: numero)
canal.account_id = cuenta.id
canal.auth_token = 'token-falso-n2'
canal.medium = :whatsapp
canal.save!

bandeja = canal.inbox || Inbox.create!(account_id: cuenta.id, name: 'N2 Twilio falso', channel: canal)

bot = AgentBot.find_or_initialize_by(account_id: cuenta.id, name: 'Captura N2')
bot.outgoing_url = ENV.fetch("N2_RECEPTOR_URL")
bot.secret = 'secreto-n2'
bot.save!
AgentBotInbox.find_or_initialize_by(inbox_id: bandeja.id).tap { |ab| ab.agent_bot_id = bot.id; ab.status = :active; ab.save! }

puts "n2: cuenta=#{cuenta.id} canal=#{canal.id} bandeja=#{bandeja.id} bot=#{bot.id} medium=#{canal.medium}"
