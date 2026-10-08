# Configura Chatwoot local para la demo (SPEC 0.5). Idempotente: se corre en cada
# `docker compose up` y deja lo mismo aunque se haya hecho `down -v`.
#
# Crea o actualiza: la cuenta de la demo, un administrador (el asesor), el Agent Bot con su
# webhook al backend y su secreto de firma, y los tokens de API. Los valores vienen de
# config/demo-local.env. No toca otras cuentas ni usuarios.
#
# La bandeja la crea después scripts/preparar-chatwoot.ts, con el nombre de la vertical que
# está en la base del backend.

def env!(nombre)
  ENV.fetch(nombre) { abort "Falta #{nombre}" }
end

ActiveRecord::Base.transaction do
  cuenta = Account.find_or_create_by!(name: env!('CHATWOOT_CUENTA'))
  cuenta.update!(locale: 'es') unless cuenta.locale == 'es'

  usuario = User.find_by(email: env!('CHATWOOT_ADMIN_EMAIL'))
  unless usuario
    usuario = User.new(
      name: env!('CHATWOOT_ADMIN_NOMBRE'),
      email: env!('CHATWOOT_ADMIN_EMAIL'),
      password: env!('CHATWOOT_ADMIN_PASSWORD'),
      password_confirmation: env!('CHATWOOT_ADMIN_PASSWORD')
    )
    usuario.skip_confirmation!
    usuario.save!
  end
  AccountUser.find_or_create_by!(account_id: cuenta.id, user_id: usuario.id) { |au| au.role = :administrator }
  (usuario.access_token || AccessToken.create!(owner: usuario)).update!(token: env!('CHATWOOT_ADMIN_TOKEN'))

  bot = AgentBot.find_or_initialize_by(account_id: cuenta.id, name: env!('CHATWOOT_BOT_NOMBRE'))
  bot.outgoing_url = env!('CHATWOOT_WEBHOOK_URL')
  bot.secret = env!('CHATWOOT_WEBHOOK_SECRETO')
  bot.save!
  (bot.access_token || AccessToken.create!(owner: bot)).update!(token: env!('CHATWOOT_BOT_TOKEN'))

  puts "chatwoot-setup: cuenta=#{cuenta.id} asesor=#{usuario.id} bot=#{bot.id}"
end

# Si nadie ha pasado por el onboarding, la interfaz lo exigiría antes del login.
::Redis::Alfred.delete(::Redis::Alfred::CHATWOOT_INSTALLATION_ONBOARDING)
