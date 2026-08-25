/* Alarmo Mushroom Card
 * A Home Assistant Lovelace card for the Alarmo alarm panel, drawn in the
 * Mushroom design language. Standalone: nothing to install alongside it.
 *
 * Licensed under Apache-2.0. See LICENSE and NOTICE — the Alarmo protocol is
 * reimplemented from nielsfaber/alarmo-card and the visual system reproduces
 * piitaya/lovelace-mushroom, both Apache-2.0.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1 · Identity                                                        */
  /* ------------------------------------------------------------------ */

  const CARD_TYPE = 'alarmo-mushroom-card';
  const EDITOR_TYPE = 'alarmo-mushroom-card-editor';
  const CARD_VERSION = '0.1.4';
  const DOCS_URL = 'https://github.com/lucasgiovanny/alarmo-mushroom-card';

  /* ------------------------------------------------------------------ */
  /* 2 · Alarmo backend contract                                         */
  /* ------------------------------------------------------------------ */

  /* Alarmo registers nine websocket commands; the card needs four of them.
     Named here rather than inline so tests/backend-contract.test.mjs can pin
     the strings — a rename on the integration side is otherwise a silent
     blank card. */
  const WS = Object.freeze({
    entities: 'alarmo/entities',
    config: 'alarmo/config',
    sensors: 'alarmo/sensors',
    areas: 'alarmo/areas',
    countdown: 'alarmo/countdown',
    readyModes: 'alarmo/ready_to_arm_modes'
  });

  /* Alarmo publishes on the Home Assistant event bus, not through a websocket
     subscription. Its only websocket subscription is `alarmo_config_updated`,
     a bare ping with no event name and no data, meant for its own config
     panel — subscribing to anything else silently connects to nothing and
     every event-driven feature quietly dies.
     Read out of custom_components/alarmo/event.py at Alarmo 1.10.19. */
  const BUS_EVENTS = Object.freeze({
    /* Also carries command_not_allowed, invalid_code_provided and
       no_code_provided; `reason` is what tells them apart. */
    failed: 'alarmo_failed_to_arm',
    success: 'alarmo_command_success',
    readyModes: 'alarmo_ready_to_arm_modes_updated'
  });
  const REASON = Object.freeze({
    openSensors: 'open_sensors',
    notAllowed: 'not_allowed',
    invalidCode: 'invalid_code'
  });
  const DOMAIN = 'alarmo';
  const SERVICE = Object.freeze({ arm: 'arm', disarm: 'disarm', skipDelay: 'skip_delay' });

  /* alarm_control_panel supported_features bitmask. */
  const FEATURE = Object.freeze({
    ARM_HOME: 1,
    ARM_AWAY: 2,
    ARM_NIGHT: 4,
    TRIGGER: 8,
    ARM_CUSTOM_BYPASS: 16,
    ARM_VACATION: 32
  });

  /* Ordered: this is the default left-to-right button order when the config
     does not set button_order. Away first because it is the mode people reach
     for on the way out, which is when they are least patient. */
  const ARM_MODES = Object.freeze([
    { state: 'armed_away', bit: FEATURE.ARM_AWAY, icon: 'mdi:lock' },
    { state: 'armed_home', bit: FEATURE.ARM_HOME, icon: 'mdi:home' },
    { state: 'armed_night', bit: FEATURE.ARM_NIGHT, icon: 'mdi:moon-waning-crescent' },
    { state: 'armed_vacation', bit: FEATURE.ARM_VACATION, icon: 'mdi:airplane' },
    { state: 'armed_custom_bypass', bit: FEATURE.ARM_CUSTOM_BYPASS, icon: 'mdi:shield' }
  ]);

  const DISARM_ICON = 'mdi:shield-off';

  /* The nine states a config may carry a states.<state> block for. */
  const STATE_KEYS = Object.freeze([
    'disarmed', 'arming', 'pending', 'triggered',
    'armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'armed_custom_bypass'
  ]);

  /* States with no button of their own — they can be relabelled and recoloured
     but have no button_label / button_icon / hide / button_order. Upstream's
     editor could not reach these at all. */
  const TRANSIENT_STATES = Object.freeze(['arming', 'pending', 'triggered']);

  const PENDING_STATES = Object.freeze(['arming', 'pending']);
  const HIDE_MODES = Object.freeze(['never', 'always', 'disarmed', 'armed']);

  /* Icon fallbacks for the sensors listed in open_sensors / bypassed_sensors,
     keyed by device_class. The open/closed pair is swapped live in _paint():
     watching the icon flip is half of the "did shutting the door work?"
     feedback. */
  const SENSOR_ICONS = Object.freeze({
    door: ['mdi:door-open', 'mdi:door-closed'],
    garage_door: ['mdi:garage-open', 'mdi:garage'],
    window: ['mdi:window-open', 'mdi:window-closed'],
    opening: ['mdi:square-outline', 'mdi:square'],
    motion: ['mdi:motion-sensor', 'mdi:motion-sensor-off'],
    moving: ['mdi:motion-sensor', 'mdi:motion-sensor-off'],
    lock: ['mdi:lock-open-variant', 'mdi:lock'],
    smoke: ['mdi:smoke', 'mdi:smoke-detector'],
    gas: ['mdi:gas-cylinder', 'mdi:gas-cylinder'],
    water: ['mdi:water-alert', 'mdi:water-off'],
    tamper: ['mdi:shield-alert', 'mdi:shield-check'],
    _default: ['mdi:alert-circle', 'mdi:check-circle']
  });

  /* ------------------------------------------------------------------ */
  /* 3 · Localization                                                    */
  /* ------------------------------------------------------------------ */

  const SUPPORTED_LANGS = ['en', 'pt-br', 'pt-pt', 'es', 'fr', 'de', 'it'];
  const DEFAULT_LANG = 'en';
  /* A bare "pt" profile resolves to European Portuguese; pt-BR has to ask for
     itself. Guessing the other way would hand Brazil the wrong Portuguese far
     more often than the reverse. */
  const LANGUAGE_ALIASES = new Map([['pt', 'pt-pt']]);

  const LANGUAGE_OPTIONS = Object.freeze([
    { value: 'auto', labelKey: 'editor.lang_auto' },
    { value: 'en', labelKey: 'editor.lang_en' },
    { value: 'pt-br', labelKey: 'editor.lang_pt_br' },
    { value: 'pt-pt', labelKey: 'editor.lang_pt_pt' },
    { value: 'es', labelKey: 'editor.lang_es' },
    { value: 'fr', labelKey: 'editor.lang_fr' },
    { value: 'de', labelKey: 'editor.lang_de' },
    { value: 'it', labelKey: 'editor.lang_it' }
  ]);

  const I18N = Object.freeze({
    en: {
      card: {
        unavailable: 'Unavailable',
        no_entity: 'No entity configured',
        entity_missing: 'Entity not found',
        not_alarmo: 'This entity is not managed by Alarmo',
        backend_missing: 'Alarmo is not installed, or this entity is not one of its panels'
      },
      state: {
        disarmed: 'Disarmed', arming: 'Arming', pending: 'Pending', triggered: 'Triggered',
        armed_away: 'Armed away', armed_home: 'Armed home', armed_night: 'Armed night',
        armed_vacation: 'Armed vacation', armed_custom_bypass: 'Armed custom', unknown: 'Unknown'
      },
      button: {
        disarm: 'Disarm', armed_away: 'Away', armed_home: 'Home', armed_night: 'Night',
        armed_vacation: 'Vacation', armed_custom_bypass: 'Custom'
      },
      countdown: { skip: 'Skip the delay' },
      keypad: { enter_code: 'Enter code', clear: 'Clear', submit: 'Confirm', backspace: 'Delete' },
      notice: {
        blocked_title: 'Cannot arm yet',
        blocked_ready: 'All clear — ready to arm',
        triggered_title: 'Triggered by',
        bypassed_title: 'Armed with bypassed sensors',
        count_one: '{n} sensor open',
        count_other: '{n} sensors open',
        bypassed_one: '{n} sensor is not being watched',
        bypassed_other: '{n} sensors are not being watched',
        sensor_open: 'Open', sensor_closed: 'Closed', sensor_bypassed: 'Bypassed',
        sensor_missing: 'No longer in Home Assistant',
        action_bypass: 'Arm anyway', action_bypass_confirm: 'Tap again to confirm',
        action_retry: 'Arm now', more: '+{n} more'
      },
      sheet: {
        arming: 'Arming {name} · {mode}', disarming: 'Disarming {name}',
        exit_delay: '{n} s to leave', no_exit_delay: 'No exit delay',
        bypassing_one: 'bypassing {n} sensor', bypassing_other: 'bypassing {n} sensors'
      },
      arm_options: { force: 'Bypass open sensors', skip_delay: 'Arm without delay' },
      ready: { ready: 'Ready to arm', not_ready: 'Sensors open' },
      errors: {
        invalid_pin: 'Wrong code', no_code: 'A code is required',
        not_allowed: 'Not allowed', failed_to_arm: 'Could not arm'
      },
      editor: {
        entity: 'Alarmo entity', name: 'Name', language: 'Language',
        lang_auto: 'Auto', lang_en: 'English', lang_pt_br: 'Portuguese (Brazil)',
        lang_pt_pt: 'Portuguese (Portugal)', lang_es: 'Spanish', lang_fr: 'French',
        lang_de: 'German', lang_it: 'Italian',
        appearance: 'Appearance', buttons: 'Buttons', keypad: 'Keypad', notices: 'Open sensors',
        layout: 'Layout', layout_default: 'Default', layout_horizontal: 'Horizontal',
        layout_vertical: 'Vertical',
        icon_type: 'Icon', icon_type_icon: 'Show', icon_type_none: 'Hide',
        fill_container: 'Fill container',
        button_scale_actions: 'Action button size', button_scale_keypad: 'Keypad size',
        show_ready_indicator: 'Show a ready-to-arm dot on each button',
        show_force_option: 'Show the bypass shortcut',
        show_skip_delay_option: 'Show the no-delay shortcut',
        hide_keypad: 'Hide the keypad', keep_keypad_visible: 'Always keep the keypad on screen',
        keep_keypad_visible_help: 'Draw the keypad even when the current action needs no code.',
        use_code_dialog: 'Ask for the code in a sheet',
        use_code_dialog_help: 'This card opens its own sheet rather than the Home Assistant dialog.',
        show_messages: 'Show which sensors are open',
        show_messages_help: 'Turning this off hides the list only. The bypass button has its own setting.',
        show_bypass_button: 'Show the bypass button',
        confirm_bypass: 'Ask for a second tap before bypassing',
        show_bypassed_sensors: 'Show bypassed sensors while armed',
        max_sensor_chips: 'Sensors shown before "+N more"',
        state_label: 'State label', button_label: 'Button label', button_icon: 'Button icon',
        color: 'Colour', button_order: 'Order',
        hide: 'Show this button', hide_never: 'Always', hide_always: 'Never',
        hide_disarmed: 'Only while armed', hide_armed: 'Only while disarmed',
        button_content: 'Mode buttons show',
        button_content_both: 'Icon and name',
        button_content_icon: 'Icon only', button_content_name: 'Name only',
        section_state: 'State: {state}'
      }
    },
    'pt-br': {
      card: {
        unavailable: 'Indisponível',
        no_entity: 'Nenhuma entidade configurada',
        entity_missing: 'Entidade não encontrada',
        not_alarmo: 'Esta entidade não é gerenciada pelo Alarmo',
        backend_missing: 'O Alarmo não está instalado, ou esta entidade não é um painel dele'
      },
      state: {
        disarmed: 'Desarmado', arming: 'Armando', pending: 'Aguardando', triggered: 'Disparado',
        armed_away: 'Armado fora', armed_home: 'Armado em casa', armed_night: 'Armado noturno',
        armed_vacation: 'Armado férias', armed_custom_bypass: 'Armado personalizado', unknown: 'Desconhecido'
      },
      button: {
        disarm: 'Desarmar', armed_away: 'Fora', armed_home: 'Em casa', armed_night: 'Noite',
        armed_vacation: 'Férias', armed_custom_bypass: 'Personalizado'
      },
      countdown: { skip: 'Pular a espera' },
      keypad: { enter_code: 'Digite o código', clear: 'Limpar', submit: 'Confirmar', backspace: 'Apagar' },
      notice: {
        blocked_title: 'Ainda não dá para armar',
        blocked_ready: 'Tudo fechado — pronto para armar',
        triggered_title: 'Disparado por',
        bypassed_title: 'Armado com sensores ignorados',
        count_one: '{n} sensor aberto',
        count_other: '{n} sensores abertos',
        bypassed_one: '{n} sensor não está sendo vigiado',
        bypassed_other: '{n} sensores não estão sendo vigiados',
        sensor_open: 'Aberto', sensor_closed: 'Fechado', sensor_bypassed: 'Ignorado',
        sensor_missing: 'Não existe mais no Home Assistant',
        action_bypass: 'Armar mesmo assim', action_bypass_confirm: 'Toque de novo para confirmar',
        action_retry: 'Armar agora', more: 'mais {n}'
      },
      sheet: {
        arming: 'Armando {name} · {mode}', disarming: 'Desarmando {name}',
        exit_delay: '{n} s para sair', no_exit_delay: 'Sem tempo de saída',
        bypassing_one: 'ignorando {n} sensor', bypassing_other: 'ignorando {n} sensores'
      },
      arm_options: { force: 'Ignorar sensores abertos', skip_delay: 'Armar sem espera' },
      ready: { ready: 'Pronto para armar', not_ready: 'Sensores abertos' },
      errors: {
        invalid_pin: 'Código errado', no_code: 'É preciso informar um código',
        not_allowed: 'Não permitido', failed_to_arm: 'Não foi possível armar'
      },
      editor: {
        entity: 'Entidade do Alarmo', name: 'Nome', language: 'Idioma',
        lang_auto: 'Automático', lang_en: 'Inglês', lang_pt_br: 'Português (Brasil)',
        lang_pt_pt: 'Português (Portugal)', lang_es: 'Espanhol', lang_fr: 'Francês',
        lang_de: 'Alemão', lang_it: 'Italiano',
        appearance: 'Aparência', buttons: 'Botões', keypad: 'Teclado', notices: 'Sensores abertos',
        layout: 'Layout', layout_default: 'Padrão', layout_horizontal: 'Horizontal',
        layout_vertical: 'Vertical',
        icon_type: 'Ícone', icon_type_icon: 'Mostrar', icon_type_none: 'Esconder',
        fill_container: 'Preencher o espaço',
        button_scale_actions: 'Tamanho dos botões de ação', button_scale_keypad: 'Tamanho do teclado',
        show_ready_indicator: 'Mostrar um ponto de "pronto para armar" em cada botão',
        show_force_option: 'Mostrar o atalho de ignorar sensores',
        show_skip_delay_option: 'Mostrar o atalho de armar sem espera',
        hide_keypad: 'Esconder o teclado', keep_keypad_visible: 'Manter o teclado sempre na tela',
        keep_keypad_visible_help: 'Desenha o teclado mesmo quando a ação atual não pede código.',
        use_code_dialog: 'Pedir o código em uma folha',
        use_code_dialog_help: 'Este card abre a própria folha, não o diálogo do Home Assistant.',
        show_messages: 'Mostrar quais sensores estão abertos',
        show_messages_help: 'Desligar esconde só a lista. O botão de ignorar tem opção própria.',
        show_bypass_button: 'Mostrar o botão de ignorar',
        confirm_bypass: 'Pedir um segundo toque antes de ignorar',
        show_bypassed_sensors: 'Mostrar sensores ignorados enquanto armado',
        max_sensor_chips: 'Sensores mostrados antes de "mais N"',
        state_label: 'Rótulo do estado', button_label: 'Rótulo do botão', button_icon: 'Ícone do botão',
        color: 'Cor', button_order: 'Ordem',
        hide: 'Mostrar este botão', hide_never: 'Sempre', hide_always: 'Nunca',
        hide_disarmed: 'Só quando armado', hide_armed: 'Só quando desarmado',
        button_content: 'Botões de modo mostram',
        button_content_both: 'Ícone e nome',
        button_content_icon: 'Só o ícone', button_content_name: 'Só o nome',
        section_state: 'Estado: {state}'
      }
    },
    'pt-pt': {
      card: {
        unavailable: 'Indisponível',
        no_entity: 'Nenhuma entidade configurada',
        entity_missing: 'Entidade não encontrada',
        not_alarmo: 'Esta entidade não é gerida pelo Alarmo',
        backend_missing: 'O Alarmo não está instalado, ou esta entidade não é um painel dele'
      },
      state: {
        disarmed: 'Desarmado', arming: 'A armar', pending: 'A aguardar', triggered: 'Disparado',
        armed_away: 'Armado ausente', armed_home: 'Armado em casa', armed_night: 'Armado noturno',
        armed_vacation: 'Armado férias', armed_custom_bypass: 'Armado personalizado', unknown: 'Desconhecido'
      },
      button: {
        disarm: 'Desarmar', armed_away: 'Ausente', armed_home: 'Em casa', armed_night: 'Noite',
        armed_vacation: 'Férias', armed_custom_bypass: 'Personalizado'
      },
      countdown: { skip: 'Saltar a espera' },
      keypad: { enter_code: 'Introduza o código', clear: 'Limpar', submit: 'Confirmar', backspace: 'Apagar' },
      notice: {
        blocked_title: 'Ainda não é possível armar',
        blocked_ready: 'Tudo fechado — pronto a armar',
        triggered_title: 'Disparado por',
        bypassed_title: 'Armado com sensores ignorados',
        count_one: '{n} sensor aberto',
        count_other: '{n} sensores abertos',
        bypassed_one: '{n} sensor não está a ser vigiado',
        bypassed_other: '{n} sensores não estão a ser vigiados',
        sensor_open: 'Aberto', sensor_closed: 'Fechado', sensor_bypassed: 'Ignorado',
        sensor_missing: 'Já não existe no Home Assistant',
        action_bypass: 'Armar mesmo assim', action_bypass_confirm: 'Toque novamente para confirmar',
        action_retry: 'Armar agora', more: 'mais {n}'
      },
      sheet: {
        arming: 'A armar {name} · {mode}', disarming: 'A desarmar {name}',
        exit_delay: '{n} s para sair', no_exit_delay: 'Sem tempo de saída',
        bypassing_one: 'a ignorar {n} sensor', bypassing_other: 'a ignorar {n} sensores'
      },
      arm_options: { force: 'Ignorar sensores abertos', skip_delay: 'Armar sem espera' },
      ready: { ready: 'Pronto a armar', not_ready: 'Sensores abertos' },
      errors: {
        invalid_pin: 'Código errado', no_code: 'É necessário um código',
        not_allowed: 'Não permitido', failed_to_arm: 'Não foi possível armar'
      },
      editor: {
        entity: 'Entidade do Alarmo', name: 'Nome', language: 'Idioma',
        lang_auto: 'Automático', lang_en: 'Inglês', lang_pt_br: 'Português (Brasil)',
        lang_pt_pt: 'Português (Portugal)', lang_es: 'Espanhol', lang_fr: 'Francês',
        lang_de: 'Alemão', lang_it: 'Italiano',
        appearance: 'Aspeto', buttons: 'Botões', keypad: 'Teclado', notices: 'Sensores abertos',
        layout: 'Disposição', layout_default: 'Predefinida', layout_horizontal: 'Horizontal',
        layout_vertical: 'Vertical',
        icon_type: 'Ícone', icon_type_icon: 'Mostrar', icon_type_none: 'Esconder',
        fill_container: 'Preencher o espaço',
        button_scale_actions: 'Tamanho dos botões de ação', button_scale_keypad: 'Tamanho do teclado',
        show_ready_indicator: 'Mostrar um ponto de "pronto a armar" em cada botão',
        show_force_option: 'Mostrar o atalho de ignorar sensores',
        show_skip_delay_option: 'Mostrar o atalho de armar sem espera',
        hide_keypad: 'Esconder o teclado', keep_keypad_visible: 'Manter o teclado sempre no ecrã',
        keep_keypad_visible_help: 'Desenha o teclado mesmo quando a ação atual não pede código.',
        use_code_dialog: 'Pedir o código numa folha',
        use_code_dialog_help: 'Este card abre a sua própria folha, não o diálogo do Home Assistant.',
        show_messages: 'Mostrar que sensores estão abertos',
        show_messages_help: 'Desligar esconde só a lista. O botão de ignorar tem opção própria.',
        show_bypass_button: 'Mostrar o botão de ignorar',
        confirm_bypass: 'Pedir um segundo toque antes de ignorar',
        show_bypassed_sensors: 'Mostrar sensores ignorados enquanto armado',
        max_sensor_chips: 'Sensores mostrados antes de "mais N"',
        state_label: 'Rótulo do estado', button_label: 'Rótulo do botão', button_icon: 'Ícone do botão',
        color: 'Cor', button_order: 'Ordem',
        hide: 'Mostrar este botão', hide_never: 'Sempre', hide_always: 'Nunca',
        hide_disarmed: 'Só quando armado', hide_armed: 'Só quando desarmado',
        button_content: 'Os botões de modo mostram',
        button_content_both: 'Ícone e nome',
        button_content_icon: 'Só o ícone', button_content_name: 'Só o nome',
        section_state: 'Estado: {state}'
      }
    },
    es: {
      card: {
        unavailable: 'No disponible',
        no_entity: 'Ninguna entidad configurada',
        entity_missing: 'Entidad no encontrada',
        not_alarmo: 'Esta entidad no está gestionada por Alarmo',
        backend_missing: 'Alarmo no está instalado, o esta entidad no es uno de sus paneles'
      },
      state: {
        disarmed: 'Desarmado', arming: 'Armando', pending: 'En espera', triggered: 'Disparado',
        armed_away: 'Armado fuera', armed_home: 'Armado en casa', armed_night: 'Armado noche',
        armed_vacation: 'Armado vacaciones', armed_custom_bypass: 'Armado personalizado', unknown: 'Desconocido'
      },
      button: {
        disarm: 'Desarmar', armed_away: 'Fuera', armed_home: 'En casa', armed_night: 'Noche',
        armed_vacation: 'Vacaciones', armed_custom_bypass: 'Personalizado'
      },
      countdown: { skip: 'Omitir la espera' },
      keypad: { enter_code: 'Introduce el código', clear: 'Borrar', submit: 'Confirmar', backspace: 'Borrar' },
      notice: {
        blocked_title: 'Todavía no se puede armar',
        blocked_ready: 'Todo cerrado — listo para armar',
        triggered_title: 'Disparado por',
        bypassed_title: 'Armado con sensores omitidos',
        count_one: '{n} sensor abierto',
        count_other: '{n} sensores abiertos',
        bypassed_one: '{n} sensor no se está vigilando',
        bypassed_other: '{n} sensores no se están vigilando',
        sensor_open: 'Abierto', sensor_closed: 'Cerrado', sensor_bypassed: 'Omitido',
        sensor_missing: 'Ya no existe en Home Assistant',
        action_bypass: 'Armar de todos modos', action_bypass_confirm: 'Toca otra vez para confirmar',
        action_retry: 'Armar ahora', more: '+{n} más'
      },
      sheet: {
        arming: 'Armando {name} · {mode}', disarming: 'Desarmando {name}',
        exit_delay: '{n} s para salir', no_exit_delay: 'Sin tiempo de salida',
        bypassing_one: 'omitiendo {n} sensor', bypassing_other: 'omitiendo {n} sensores'
      },
      arm_options: { force: 'Omitir sensores abiertos', skip_delay: 'Armar sin espera' },
      ready: { ready: 'Listo para armar', not_ready: 'Sensores abiertos' },
      errors: {
        invalid_pin: 'Código incorrecto', no_code: 'Hace falta un código',
        not_allowed: 'No permitido', failed_to_arm: 'No se pudo armar'
      },
      editor: {
        entity: 'Entidad de Alarmo', name: 'Nombre', language: 'Idioma',
        lang_auto: 'Automático', lang_en: 'Inglés', lang_pt_br: 'Portugués (Brasil)',
        lang_pt_pt: 'Portugués (Portugal)', lang_es: 'Español', lang_fr: 'Francés',
        lang_de: 'Alemán', lang_it: 'Italiano',
        appearance: 'Apariencia', buttons: 'Botones', keypad: 'Teclado', notices: 'Sensores abiertos',
        layout: 'Diseño', layout_default: 'Predeterminado', layout_horizontal: 'Horizontal',
        layout_vertical: 'Vertical',
        icon_type: 'Icono', icon_type_icon: 'Mostrar', icon_type_none: 'Ocultar',
        fill_container: 'Rellenar el contenedor',
        button_scale_actions: 'Tamaño de los botones de acción', button_scale_keypad: 'Tamaño del teclado',
        show_ready_indicator: 'Mostrar un punto de "listo para armar" en cada botón',
        show_force_option: 'Mostrar el acceso de omitir sensores',
        show_skip_delay_option: 'Mostrar el acceso de armar sin espera',
        hide_keypad: 'Ocultar el teclado', keep_keypad_visible: 'Mantener el teclado siempre visible',
        keep_keypad_visible_help: 'Dibuja el teclado aunque la acción actual no pida código.',
        use_code_dialog: 'Pedir el código en una hoja',
        use_code_dialog_help: 'Esta tarjeta abre su propia hoja, no el diálogo de Home Assistant.',
        show_messages: 'Mostrar qué sensores están abiertos',
        show_messages_help: 'Desactivarlo oculta solo la lista. El botón de omitir tiene su propia opción.',
        show_bypass_button: 'Mostrar el botón de omitir',
        confirm_bypass: 'Pedir un segundo toque antes de omitir',
        show_bypassed_sensors: 'Mostrar sensores omitidos mientras está armado',
        max_sensor_chips: 'Sensores mostrados antes de "+N más"',
        state_label: 'Etiqueta del estado', button_label: 'Etiqueta del botón', button_icon: 'Icono del botón',
        color: 'Color', button_order: 'Orden',
        hide: 'Mostrar este botón', hide_never: 'Siempre', hide_always: 'Nunca',
        hide_disarmed: 'Solo cuando está armado', hide_armed: 'Solo cuando está desarmado',
        button_content: 'Los botones de modo muestran',
        button_content_both: 'Icono y nombre',
        button_content_icon: 'Solo el icono', button_content_name: 'Solo el nombre',
        section_state: 'Estado: {state}'
      }
    },
    fr: {
      card: {
        unavailable: 'Indisponible',
        no_entity: 'Aucune entité configurée',
        entity_missing: 'Entité introuvable',
        not_alarmo: "Cette entité n'est pas gérée par Alarmo",
        backend_missing: "Alarmo n'est pas installé, ou cette entité n'est pas l'un de ses panneaux"
      },
      state: {
        disarmed: 'Désarmé', arming: 'Armement', pending: 'En attente', triggered: 'Déclenché',
        armed_away: 'Armé absent', armed_home: 'Armé présent', armed_night: 'Armé nuit',
        armed_vacation: 'Armé vacances', armed_custom_bypass: 'Armé personnalisé', unknown: 'Inconnu'
      },
      button: {
        disarm: 'Désarmer', armed_away: 'Absent', armed_home: 'Présent', armed_night: 'Nuit',
        armed_vacation: 'Vacances', armed_custom_bypass: 'Personnalisé'
      },
      countdown: { skip: "Passer le délai" },
      keypad: { enter_code: 'Saisissez le code', clear: 'Effacer', submit: 'Confirmer', backspace: 'Supprimer' },
      notice: {
        blocked_title: 'Armement impossible pour le moment',
        blocked_ready: 'Tout est fermé — prêt à armer',
        triggered_title: 'Déclenché par',
        bypassed_title: 'Armé avec des capteurs ignorés',
        count_one: '{n} capteur ouvert',
        count_other: '{n} capteurs ouverts',
        bypassed_one: "{n} capteur n'est pas surveillé",
        bypassed_other: '{n} capteurs ne sont pas surveillés',
        sensor_open: 'Ouvert', sensor_closed: 'Fermé', sensor_bypassed: 'Ignoré',
        sensor_missing: "N'existe plus dans Home Assistant",
        action_bypass: 'Armer quand même', action_bypass_confirm: 'Touchez à nouveau pour confirmer',
        action_retry: 'Armer maintenant', more: '+{n} autres'
      },
      sheet: {
        arming: 'Armement de {name} · {mode}', disarming: 'Désarmement de {name}',
        exit_delay: '{n} s pour sortir', no_exit_delay: 'Sans délai de sortie',
        bypassing_one: '{n} capteur ignoré', bypassing_other: '{n} capteurs ignorés'
      },
      arm_options: { force: 'Ignorer les capteurs ouverts', skip_delay: 'Armer sans délai' },
      ready: { ready: 'Prêt à armer', not_ready: 'Capteurs ouverts' },
      errors: {
        invalid_pin: 'Code incorrect', no_code: 'Un code est requis',
        not_allowed: 'Non autorisé', failed_to_arm: "Impossible d'armer"
      },
      editor: {
        entity: 'Entité Alarmo', name: 'Nom', language: 'Langue',
        lang_auto: 'Automatique', lang_en: 'Anglais', lang_pt_br: 'Portugais (Brésil)',
        lang_pt_pt: 'Portugais (Portugal)', lang_es: 'Espagnol', lang_fr: 'Français',
        lang_de: 'Allemand', lang_it: 'Italien',
        appearance: 'Apparence', buttons: 'Boutons', keypad: 'Clavier', notices: 'Capteurs ouverts',
        layout: 'Disposition', layout_default: 'Par défaut', layout_horizontal: 'Horizontale',
        layout_vertical: 'Verticale',
        icon_type: 'Icône', icon_type_icon: 'Afficher', icon_type_none: 'Masquer',
        fill_container: 'Remplir le conteneur',
        button_scale_actions: "Taille des boutons d'action", button_scale_keypad: 'Taille du clavier',
        show_ready_indicator: 'Afficher un point « prêt à armer » sur chaque bouton',
        show_force_option: 'Afficher le raccourci d\'ignorer',
        show_skip_delay_option: 'Afficher le raccourci sans délai',
        hide_keypad: 'Masquer le clavier', keep_keypad_visible: 'Toujours garder le clavier affiché',
        keep_keypad_visible_help: "Dessine le clavier même quand l'action en cours ne demande pas de code.",
        use_code_dialog: 'Demander le code dans une feuille',
        use_code_dialog_help: "Cette carte ouvre sa propre feuille, pas la boîte de dialogue de Home Assistant.",
        show_messages: 'Afficher les capteurs ouverts',
        show_messages_help: "Désactiver masque seulement la liste. Le bouton d'ignorer a son propre réglage.",
        show_bypass_button: "Afficher le bouton d'ignorer",
        confirm_bypass: 'Demander un second appui avant de forcer',
        show_bypassed_sensors: 'Afficher les capteurs ignorés une fois armé',
        max_sensor_chips: 'Capteurs affichés avant « +N autres »',
        state_label: "Libellé de l'état", button_label: 'Libellé du bouton', button_icon: 'Icône du bouton',
        color: 'Couleur', button_order: 'Ordre',
        hide: 'Afficher ce bouton', hide_never: 'Toujours', hide_always: 'Jamais',
        hide_disarmed: "Seulement quand c'est armé", hide_armed: "Seulement quand c'est désarmé",
        button_content: 'Les boutons de mode affichent',
        button_content_both: 'Icône et nom',
        button_content_icon: 'Icône seule', button_content_name: 'Nom seul',
        section_state: 'État : {state}'
      }
    },
    de: {
      card: {
        unavailable: 'Nicht verfügbar',
        no_entity: 'Keine Entität konfiguriert',
        entity_missing: 'Entität nicht gefunden',
        not_alarmo: 'Diese Entität wird nicht von Alarmo verwaltet',
        backend_missing: 'Alarmo ist nicht installiert, oder diese Entität ist keines seiner Panels'
      },
      state: {
        disarmed: 'Deaktiviert', arming: 'Wird aktiviert', pending: 'Wartet', triggered: 'Ausgelöst',
        armed_away: 'Aktiviert abwesend', armed_home: 'Aktiviert zuhause', armed_night: 'Aktiviert Nacht',
        armed_vacation: 'Aktiviert Urlaub', armed_custom_bypass: 'Aktiviert benutzerdefiniert', unknown: 'Unbekannt'
      },
      button: {
        disarm: 'Deaktivieren', armed_away: 'Abwesend', armed_home: 'Zuhause', armed_night: 'Nacht',
        armed_vacation: 'Urlaub', armed_custom_bypass: 'Benutzerdefiniert'
      },
      countdown: { skip: 'Verzögerung überspringen' },
      keypad: { enter_code: 'Code eingeben', clear: 'Löschen', submit: 'Bestätigen', backspace: 'Zurück' },
      notice: {
        blocked_title: 'Aktivieren noch nicht möglich',
        blocked_ready: 'Alles zu — bereit zum Aktivieren',
        triggered_title: 'Ausgelöst durch',
        bypassed_title: 'Aktiviert mit übergangenen Sensoren',
        count_one: '{n} Sensor offen',
        count_other: '{n} Sensoren offen',
        bypassed_one: '{n} Sensor wird nicht überwacht',
        bypassed_other: '{n} Sensoren werden nicht überwacht',
        sensor_open: 'Offen', sensor_closed: 'Geschlossen', sensor_bypassed: 'Übergangen',
        sensor_missing: 'Existiert nicht mehr in Home Assistant',
        action_bypass: 'Trotzdem aktivieren', action_bypass_confirm: 'Zum Bestätigen erneut tippen',
        action_retry: 'Jetzt aktivieren', more: '+{n} weitere'
      },
      sheet: {
        arming: '{name} wird aktiviert · {mode}', disarming: '{name} wird deaktiviert',
        exit_delay: '{n} s zum Verlassen', no_exit_delay: 'Ohne Verzögerung',
        bypassing_one: '{n} Sensor übergangen', bypassing_other: '{n} Sensoren übergangen'
      },
      arm_options: { force: 'Offene Sensoren übergehen', skip_delay: 'Ohne Verzögerung aktivieren' },
      ready: { ready: 'Bereit zum Aktivieren', not_ready: 'Sensoren offen' },
      errors: {
        invalid_pin: 'Falscher Code', no_code: 'Ein Code ist erforderlich',
        not_allowed: 'Nicht erlaubt', failed_to_arm: 'Aktivieren fehlgeschlagen'
      },
      editor: {
        entity: 'Alarmo-Entität', name: 'Name', language: 'Sprache',
        lang_auto: 'Automatisch', lang_en: 'Englisch', lang_pt_br: 'Portugiesisch (Brasilien)',
        lang_pt_pt: 'Portugiesisch (Portugal)', lang_es: 'Spanisch', lang_fr: 'Französisch',
        lang_de: 'Deutsch', lang_it: 'Italienisch',
        appearance: 'Darstellung', buttons: 'Schaltflächen', keypad: 'Tastenfeld', notices: 'Offene Sensoren',
        layout: 'Layout', layout_default: 'Standard', layout_horizontal: 'Horizontal',
        layout_vertical: 'Vertikal',
        icon_type: 'Symbol', icon_type_icon: 'Anzeigen', icon_type_none: 'Ausblenden',
        fill_container: 'Container füllen',
        button_scale_actions: 'Größe der Aktionsschaltflächen', button_scale_keypad: 'Größe des Tastenfelds',
        show_ready_indicator: 'Bereitschaftspunkt auf jeder Schaltfläche anzeigen',
        show_force_option: 'Kurzbefehl zum Übergehen anzeigen',
        show_skip_delay_option: 'Kurzbefehl ohne Verzögerung anzeigen',
        hide_keypad: 'Tastenfeld ausblenden', keep_keypad_visible: 'Tastenfeld immer anzeigen',
        keep_keypad_visible_help: 'Zeichnet das Tastenfeld auch, wenn die aktuelle Aktion keinen Code braucht.',
        use_code_dialog: 'Code in einem Blatt abfragen',
        use_code_dialog_help: 'Diese Karte öffnet ihr eigenes Blatt, nicht den Home-Assistant-Dialog.',
        show_messages: 'Anzeigen, welche Sensoren offen sind',
        show_messages_help: 'Ausschalten blendet nur die Liste aus. Die Schaltfläche hat eine eigene Option.',
        show_bypass_button: 'Schaltfläche zum Übergehen anzeigen',
        confirm_bypass: 'Vor dem Übergehen ein zweites Tippen verlangen',
        show_bypassed_sensors: 'Übergangene Sensoren im aktivierten Zustand anzeigen',
        max_sensor_chips: 'Sensoren vor „+N weitere"',
        state_label: 'Zustandsbezeichnung', button_label: 'Schaltflächentext', button_icon: 'Schaltflächensymbol',
        color: 'Farbe', button_order: 'Reihenfolge',
        hide: 'Diese Schaltfläche zeigen', hide_never: 'Immer', hide_always: 'Nie',
        hide_disarmed: 'Nur wenn aktiviert', hide_armed: 'Nur wenn deaktiviert',
        button_content: 'Modusschaltflächen zeigen',
        button_content_both: 'Symbol und Name',
        button_content_icon: 'Nur Symbol', button_content_name: 'Nur Name',
        section_state: 'Zustand: {state}'
      }
    },
    it: {
      card: {
        unavailable: 'Non disponibile',
        no_entity: 'Nessuna entità configurata',
        entity_missing: 'Entità non trovata',
        not_alarmo: 'Questa entità non è gestita da Alarmo',
        backend_missing: 'Alarmo non è installato, o questa entità non è uno dei suoi pannelli'
      },
      state: {
        disarmed: 'Disinserito', arming: 'Inserimento', pending: 'In attesa', triggered: 'Scattato',
        armed_away: 'Inserito fuori casa', armed_home: 'Inserito in casa', armed_night: 'Inserito notte',
        armed_vacation: 'Inserito vacanza', armed_custom_bypass: 'Inserito personalizzato', unknown: 'Sconosciuto'
      },
      button: {
        disarm: 'Disinserisci', armed_away: 'Fuori casa', armed_home: 'In casa', armed_night: 'Notte',
        armed_vacation: 'Vacanza', armed_custom_bypass: 'Personalizzato'
      },
      countdown: { skip: 'Salta il ritardo' },
      keypad: { enter_code: 'Inserisci il codice', clear: 'Cancella', submit: 'Conferma', backspace: 'Elimina' },
      notice: {
        blocked_title: 'Non è ancora possibile inserire',
        blocked_ready: 'Tutto chiuso — pronto per inserire',
        triggered_title: 'Scattato da',
        bypassed_title: 'Inserito con sensori esclusi',
        count_one: '{n} sensore aperto',
        count_other: '{n} sensori aperti',
        bypassed_one: '{n} sensore non è sorvegliato',
        bypassed_other: '{n} sensori non sono sorvegliati',
        sensor_open: 'Aperto', sensor_closed: 'Chiuso', sensor_bypassed: 'Escluso',
        sensor_missing: 'Non esiste più in Home Assistant',
        action_bypass: 'Inserisci comunque', action_bypass_confirm: 'Tocca di nuovo per confermare',
        action_retry: 'Inserisci ora', more: '+{n} altri'
      },
      sheet: {
        arming: 'Inserimento di {name} · {mode}', disarming: 'Disinserimento di {name}',
        exit_delay: '{n} s per uscire', no_exit_delay: 'Senza ritardo di uscita',
        bypassing_one: '{n} sensore escluso', bypassing_other: '{n} sensori esclusi'
      },
      arm_options: { force: 'Escludi i sensori aperti', skip_delay: 'Inserisci senza ritardo' },
      ready: { ready: 'Pronto per inserire', not_ready: 'Sensori aperti' },
      errors: {
        invalid_pin: 'Codice errato', no_code: 'Serve un codice',
        not_allowed: 'Non consentito', failed_to_arm: 'Inserimento non riuscito'
      },
      editor: {
        entity: 'Entità Alarmo', name: 'Nome', language: 'Lingua',
        lang_auto: 'Automatico', lang_en: 'Inglese', lang_pt_br: 'Portoghese (Brasile)',
        lang_pt_pt: 'Portoghese (Portogallo)', lang_es: 'Spagnolo', lang_fr: 'Francese',
        lang_de: 'Tedesco', lang_it: 'Italiano',
        appearance: 'Aspetto', buttons: 'Pulsanti', keypad: 'Tastierino', notices: 'Sensori aperti',
        layout: 'Layout', layout_default: 'Predefinito', layout_horizontal: 'Orizzontale',
        layout_vertical: 'Verticale',
        icon_type: 'Icona', icon_type_icon: 'Mostra', icon_type_none: 'Nascondi',
        fill_container: 'Riempi il contenitore',
        button_scale_actions: 'Dimensione dei pulsanti di azione', button_scale_keypad: 'Dimensione del tastierino',
        show_ready_indicator: 'Mostra un punto "pronto per inserire" su ogni pulsante',
        show_force_option: 'Mostra la scorciatoia di esclusione',
        show_skip_delay_option: 'Mostra la scorciatoia senza ritardo',
        hide_keypad: 'Nascondi il tastierino', keep_keypad_visible: 'Tieni sempre il tastierino sullo schermo',
        keep_keypad_visible_help: "Disegna il tastierino anche quando l'azione corrente non chiede il codice.",
        use_code_dialog: 'Chiedi il codice in un foglio',
        use_code_dialog_help: 'Questa scheda apre un proprio foglio, non la finestra di Home Assistant.',
        show_messages: 'Mostra quali sensori sono aperti',
        show_messages_help: "Disattivarlo nasconde solo l'elenco. Il pulsante di esclusione ha una sua opzione.",
        show_bypass_button: 'Mostra il pulsante di esclusione',
        confirm_bypass: 'Chiedi un secondo tocco prima di escludere',
        show_bypassed_sensors: 'Mostra i sensori esclusi mentre è inserito',
        max_sensor_chips: 'Sensori mostrati prima di "+N altri"',
        state_label: 'Etichetta dello stato', button_label: 'Etichetta del pulsante', button_icon: 'Icona del pulsante',
        color: 'Colore', button_order: 'Ordine',
        hide: 'Mostra questo pulsante', hide_never: 'Sempre', hide_always: 'Mai',
        hide_disarmed: 'Solo quando è inserito', hide_armed: 'Solo quando è disinserito',
        button_content: 'I pulsanti di modo mostrano',
        button_content_both: 'Icona e nome',
        button_content_icon: 'Solo icona', button_content_name: 'Solo nome',
        section_state: 'Stato: {state}'
      }
    }
  });

  function normalizeLanguageCode(value) {
    const tag = String(value || '').trim().toLowerCase().replace(/_/g, '-');
    if (!tag || tag === 'auto') return tag;
    /* Regional bundles (pt-br, pt-pt) must survive normalization, so the full
       tag is tried before falling back to the bare base tag. */
    if (SUPPORTED_LANGS.includes(tag)) return tag;
    if (LANGUAGE_ALIASES.has(tag)) return LANGUAGE_ALIASES.get(tag);
    const base = tag.split('-')[0];
    if (SUPPORTED_LANGS.includes(base)) return base;
    return LANGUAGE_ALIASES.get(base) || base;
  }

  function resolveLanguage(preferred, hass) {
    const pref = normalizeLanguageCode(preferred);
    if (pref && pref !== 'auto' && SUPPORTED_LANGS.includes(pref)) return pref;
    const candidates = [
      hass && hass.locale ? hass.locale.language : '',
      hass ? hass.language : '',
      typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '',
      typeof navigator !== 'undefined' ? navigator.language : ''
    ];
    for (const candidate of candidates) {
      const code = normalizeLanguageCode(candidate);
      if (SUPPORTED_LANGS.includes(code)) return code;
    }
    return DEFAULT_LANG;
  }

  function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    let cur = obj;
    for (const part of String(path).split('.')) {
      cur = cur == null ? undefined : cur[part];
      if (cur == null) break;
    }
    return cur;
  }

  function tLang(lang, key, fallback) {
    const source = I18N[normalizeLanguageCode(lang)] || I18N[DEFAULT_LANG];
    const value = getByPath(source, key);
    if (typeof value === 'string' && value.length) return value;
    const base = getByPath(I18N[DEFAULT_LANG], key);
    if (typeof base === 'string' && base.length) return base;
    return fallback || key;
  }

  /* Intl.PluralRules would be the correct tool, but every language shipped
     here uses the plain one/other split. A seventh language with a third form
     is the moment to reach for it, not before. */
  function tCount(lang, stem, n) {
    const key = stem + (Math.abs(n) === 1 ? '_one' : '_other');
    return tLang(lang, key, '{n}').replace('{n}', String(n));
  }

  function fireEvent(node, type, detail) {
    node.dispatchEvent(new CustomEvent(type, {
      detail: detail, bubbles: true, composed: true, cancelable: false
    }));
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  /* Entity ids and friendly names both reach the markup through template
     literals. A name is user-controlled text from the entity registry, so it
     goes through here; skipping it once is an injection into our own shadow
     root. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------ */
  /* 4 · Design tokens                                                   */
  /* ------------------------------------------------------------------ */

  /* Every size token is written as var(--mush-x, default). A Mushroom theme
     already installed in Home Assistant sets those --mush-* keys globally, so
     this card picks up the user's theme without knowing it exists. The
     defaults are Mushroom's own values, so a house without such a theme still
     matches a Mushroom card sitting next to it. */
  const TOKENS_CSS = `
    :host{
      display:block;

      /* Raw triplets, never rgb() — everything downstream needs to compose
         them into rgba() at various opacities. */
      --amc-rgb-red:244,67,54;
      --amc-rgb-orange:255,152,0;
      --amc-rgb-green:76,175,80;
      --amc-rgb-blue:33,150,243;
      --amc-rgb-grey:158,158,158;
      --amc-rgb-disabled:189,189,189;
      /* The theme owns the text colour; the fallback is only for a theme that
         forgot to publish the triplet form. */
      --amc-rgb-text:var(--rgb-primary-text-color,33,33,33);

      /* Semantic layer */
      --amc-rgb-info:var(--amc-rgb-blue);
      --amc-rgb-success:var(--amc-rgb-green);
      --amc-rgb-warning:var(--amc-rgb-orange);
      --amc-rgb-danger:var(--amc-rgb-red);

      /* Alarm layer */
      --amc-rgb-disarmed:var(--amc-rgb-info);
      --amc-rgb-armed:var(--amc-rgb-success);
      --amc-rgb-triggered:var(--amc-rgb-danger);

      /* Sizing */
      --amc-spacing:var(--mush-spacing,10px);
      --amc-control-spacing:var(--mush-control-spacing,12px);
      --amc-icon-size:var(--mush-icon-size,36px);
      --amc-icon-symbol-size:var(--mush-icon-symbol-size,0.667em);
      --amc-icon-radius:var(--mush-icon-border-radius,50%);
      --amc-badge-size:var(--mush-badge-size,16px);
      --amc-badge-icon-size:var(--mush-badge-icon-size,0.75em);
      --amc-badge-radius:var(--mush-badge-border-radius,50%);
      --amc-control-height:var(--mush-control-height,42px);
      --amc-control-radius:var(--mush-control-border-radius,12px);
      --amc-control-icon-size:var(--mush-control-icon-size,0.5em);
      --amc-chip-height:var(--mush-chip-height,36px);
      --amc-chip-radius:var(--mush-chip-border-radius,19px);

      /* Typography. The secondary line is --primary-text-color, not
         --secondary-text-color: that is Mushroom's choice, and matching it is
         the difference between "sits beside a Mushroom card" and "almost". */
      --amc-primary-size:var(--mush-card-primary-font-size,14px);
      --amc-primary-weight:var(--mush-card-primary-font-weight,500);
      --amc-primary-line:var(--mush-card-primary-line-height,20px);
      --amc-primary-spacing:var(--mush-card-primary-letter-spacing,0.1px);
      --amc-primary-color:var(--mush-card-primary-color,var(--primary-text-color));
      --amc-secondary-size:var(--mush-card-secondary-font-size,12px);
      --amc-secondary-weight:var(--mush-card-secondary-font-weight,400);
      --amc-secondary-line:var(--mush-card-secondary-line-height,16px);
      --amc-secondary-spacing:var(--mush-card-secondary-letter-spacing,0.4px);
      --amc-secondary-color:var(--mush-card-secondary-color,var(--primary-text-color));

      /* Filled in by _syncTheme() once the theme's own values are known to be
         usable. These are what a theme that leaves them unset gets. */
      --amc-card-radius:12px;
    }

    /* Dark mode moves exactly one token. Everything else is expressed against
       --primary-text-color, which Home Assistant already flips — copying more
       overrides here would create a second palette to keep in sync for no
       visual gain. */
    :host([data-dark]){ --amc-rgb-disabled:111,111,111; }
  `;

  /* ------------------------------------------------------------------ */
  /* 5 · Mushroom primitives                                             */
  /* ------------------------------------------------------------------ */

  /* Mushroom ships these as custom elements because it is Lit and the
     component is its composition unit. Here the composition unit is a
     function returning an HTML string inside one shadow root, so they are
     classes with the same custom-property contract. Class names mirror
     Mushroom's element names so the two stylesheets read alike side by side. */
  const PRIMITIVES_CSS = `
    *{box-sizing:border-box}

    .state-item{
      display:flex;flex-direction:row;align-items:center;
      padding:var(--amc-spacing);gap:var(--amc-spacing);
      min-width:0;
    }
    .state-item.vertical{flex-direction:column}
    .state-item.vertical .state-info{text-align:center}

    .icon-wrap{position:relative;flex:none;line-height:0}

    .shape{
      position:relative;flex:none;
      width:var(--amc-icon-size);height:var(--amc-icon-size);
      /* font-size drives the em-based --amc-icon-symbol-size below. */
      font-size:var(--amc-icon-size);
      border-radius:var(--amc-icon-radius);
      display:flex;align-items:center;justify-content:center;
      background-color:var(--amc-shape-color,rgba(var(--amc-rgb-text),0.05));
      transition-property:background-color,box-shadow;
      transition-duration:280ms;
      transition-timing-function:ease-out;
      animation:var(--amc-shape-animation,none);
    }
    .shape ha-icon{
      display:flex;line-height:0;
      --mdc-icon-size:var(--amc-icon-symbol-size);
      color:var(--amc-icon-color,var(--primary-text-color));
      transition:color 280ms ease-in-out;
    }

    .badge{
      position:absolute;top:-3px;right:-3px;
      width:var(--amc-badge-size);height:var(--amc-badge-size);
      font-size:var(--amc-badge-size);
      border-radius:var(--amc-badge-radius);
      display:flex;align-items:center;justify-content:center;line-height:0;
      background-color:var(--amc-badge-color,rgb(var(--amc-rgb-grey)));
      transition:background-color 280ms ease-in-out;
    }
    .badge ha-icon{--mdc-icon-size:var(--amc-badge-icon-size);color:#fff}

    .state-info{display:flex;flex-direction:column;min-width:0;flex:1}
    .state-info .primary{
      font-size:var(--amc-primary-size);font-weight:var(--amc-primary-weight);
      line-height:var(--amc-primary-line);letter-spacing:var(--amc-primary-spacing);
      color:var(--amc-primary-color);
      text-overflow:ellipsis;overflow:hidden;white-space:nowrap;
    }
    .state-info .secondary{
      font-size:var(--amc-secondary-size);font-weight:var(--amc-secondary-weight);
      line-height:var(--amc-secondary-line);letter-spacing:var(--amc-secondary-spacing);
      color:var(--amc-secondary-color);
      text-overflow:ellipsis;overflow:hidden;white-space:nowrap;
    }

    .control{
      position:relative;
      height:var(--amc-h,var(--amc-control-height));
      border:none;border-radius:var(--amc-control-radius);
      background-color:var(--amc-bg-color,rgba(var(--amc-rgb-text),0.05));
      color:var(--amc-icon-color,var(--primary-text-color));
      cursor:pointer;
      display:inline-flex;align-items:center;justify-content:center;
      gap:calc(var(--amc-spacing) / 2);
      padding:0 12px;
      font:inherit;
      /* font:inherit resets font-size, and the em-based --amc-control-icon-size
         is measured against it. Reapplying the token has to happen after the
         shorthand or every control icon collapses to the document body size. */
      font-size:var(--amc-h,var(--amc-control-height));
      /* The 280ms background transition is Mushroom's entire press
         affordance. A transform:scale() here rounds the 12px radius unevenly
         mid-animation and re-lays out its flex neighbours on every tap. */
      transition:background-color 280ms ease-in-out;
      -webkit-tap-highlight-color:transparent;
      min-width:0;
    }
    .control ha-icon{--mdc-icon-size:var(--amc-control-icon-size);display:flex;flex:none}
    .control .label{
      font-size:var(--amc-primary-size);font-weight:var(--amc-primary-weight);
      letter-spacing:var(--amc-primary-spacing);
      text-overflow:ellipsis;overflow:hidden;white-space:nowrap;
    }
    .control:hover{background-color:var(--amc-bg-hover,rgba(var(--amc-rgb-text),0.09))}
    .control[disabled],.control[aria-disabled="true"]{
      /* Recede by fading, not by tinting. Mushroom's disabled fill is 20% of
         the disabled grey, which on a dark card is brighter than the 5% neutral
         next to it — the unavailable buttons ended up looking like the
         highlighted ones. A weaker neutral works in both modes. */
      background-color:rgba(var(--amc-rgb-text),0.03);
      color:rgb(var(--amc-rgb-disabled));
      cursor:default;
      /* aria-disabled rather than the disabled attribute so the button keeps
         announcing itself to a screen reader; pointer-events is what actually
         stops the tap. Upstream greyed the ready dot but left the button live,
         so a "not ready" tap still produced a failed arm. */
      pointer-events:none;
    }
    .control.icon-only{width:var(--amc-h,var(--amc-control-height));padding:0}

    /* One row, always. Wrapping to a second line reads as a mistake whenever
       the card looks like it had room, and squeezing four labels into a narrow
       card left every one of them as "A…", "H…", "N…". So when the words stop
       fitting the row drops to icons instead of to two lines — _syncDensity()
       measures and sets .compact. */
    .button-group{display:flex;flex-direction:row;flex-wrap:nowrap;width:100%;gap:var(--amc-spacing)}
    .button-group > .control{flex:1 1 0;min-width:0}
    .button-group.compact > .control{padding:0}
    .button-group.compact .label{display:none}
    .button-group.hug{justify-content:flex-end;flex-wrap:nowrap}
    .button-group.hug > .control{flex:0 0 auto}

    .actions{
      display:flex;flex-direction:row;align-items:center;
      padding:var(--amc-control-spacing);padding-top:0;
      gap:var(--amc-control-spacing);
      /* A last-resort scroller. The row wraps rather than overflowing, but a
         very large button_scale on a very narrow card can still exceed one
         line's width, and scrolling beats spilling outside the card. */
      overflow-x:auto;overflow-y:hidden;
      scrollbar-width:none;-ms-overflow-style:none;
      --amc-h:calc(var(--amc-control-height) * var(--amc-scale-actions,1));
    }
    .actions::-webkit-scrollbar{height:0;background:transparent}

    @keyframes amc-pulse{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
    @keyframes amc-shake{
      0%{transform:translateX(0)}25%{transform:translateX(-6px)}
      50%{transform:translateX(0)}75%{transform:translateX(6px)}100%{transform:translateX(0)}
    }
    @keyframes amc-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  `;

  /* ------------------------------------------------------------------ */
  /* 6 · Card chrome                                                     */
  /* ------------------------------------------------------------------ */

  const CARD_CSS = `
    ha-card{
      display:flex;flex-direction:column;justify-content:center;
      height:auto;overflow:hidden;
    }
    ha-card.fill{height:100%}
    :host([data-layout="grid"]) ha-card{height:100%}

    /* ---- header ---- */
    .header{padding:var(--amc-control-spacing);padding-bottom:var(--amc-spacing)}
    .header .state-item{padding:0;cursor:pointer}
    .hero{position:relative;flex:none;width:var(--amc-icon-size);height:var(--amc-icon-size)}
    .hero .shape{position:absolute;inset:0}

    /* The ring is drawn outside the 36px shape rather than around it, so the
       shape keeps Mushroom's exact geometry and a theme that squares off
       --mush-icon-border-radius cannot deform the countdown arc with it. */
    .ring{
      position:absolute;left:50%;top:50%;
      width:calc(var(--amc-icon-size) + 12px);height:calc(var(--amc-icon-size) + 12px);
      transform:translate(-50%,-50%) rotate(-90deg);
      pointer-events:none;
    }
    .ring circle{fill:none;stroke-width:3;stroke-linecap:round}
    .ring .track{stroke:rgba(var(--amc-state-rgb),0.2)}
    .ring .arc{
      stroke:rgb(var(--amc-state-rgb));
      stroke-dasharray:var(--amc-ring-dash,0 138.23);
      transition:stroke-dasharray 1s linear;
    }
    .countdown-value{
      position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font-size:calc(var(--amc-icon-size) * 0.38);font-weight:600;
      font-variant-numeric:tabular-nums;
      color:rgb(var(--amc-state-rgb));pointer-events:none;
    }
    /* Swapping the number for a skip glyph on hover is a pointer affordance
       only. On a touch screen the "hover" fires with the tap that triggers the
       skip, so the label changed under the finger that had already committed. */
    @media (hover:hover) and (pointer:fine){
      .header .state-item:hover .countdown-value ha-icon{display:flex}
      .header .state-item:hover .countdown-value .digits{display:none}
    }
    .countdown-value ha-icon{display:none;--mdc-icon-size:calc(var(--amc-icon-size) * 0.5)}

    /* ---- open-sensor notice ---- */
    .notice{
      margin:0 var(--amc-control-spacing) var(--amc-control-spacing);
      padding:var(--amc-spacing);
      border-radius:var(--amc-control-radius);
      background-color:rgba(var(--amc-notice-rgb),0.08);
      color:rgb(var(--amc-notice-rgb));
      /* An inset ring, not a border: a real border adds 2px to the box, and
         because this panel comes and goes between renders those 2px shoved
         the keypad down by a full row on every failed arm. */
      box-shadow:inset 0 0 0 1px rgba(var(--amc-notice-rgb),0.2);
    }
    @supports (background:color-mix(in srgb,red 10%,transparent)){
      .notice{background-color:color-mix(in srgb,rgb(var(--amc-notice-rgb)) 8%,transparent)}
    }
    /* The action strip carries the kind too, so a panel that has gone green
       does not sit above a button still tinted with the warning colour. */
    .notice[data-kind="blocked"],.notice-actions[data-kind="blocked"]{
      --amc-notice-rgb:var(--amc-rgb-warning)}
    .notice[data-kind="triggered"],.notice-actions[data-kind="triggered"]{
      --amc-notice-rgb:var(--amc-rgb-danger)}
    .notice[data-kind="bypassed"],.notice-actions[data-kind="bypassed"]{
      --amc-notice-rgb:var(--amc-rgb-warning)}
    .notice[data-kind="ready"],.notice-actions[data-kind="ready"]{
      --amc-notice-rgb:var(--amc-rgb-success)}

    .notice-head{
      display:flex;align-items:center;gap:6px;
      font-size:var(--amc-secondary-size);font-weight:600;
      line-height:var(--amc-secondary-line);
    }
    .notice-head > ha-icon{--mdc-icon-size:16px;flex:none;display:flex}
    .notice[data-kind="triggered"] .notice-head > ha-icon{
      animation:1s ease 0s infinite normal none running amc-pulse;
    }
    .notice-title{flex:1;min-width:0;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
    /* The count survives the chips scrolling out of view. Without it "3 of 7"
       reads as "3", and the user bypasses believing they closed everything. */
    .notice-count{
      flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;
      background-color:rgba(var(--amc-notice-rgb),0.18);
      font-variant-numeric:tabular-nums;text-align:center;line-height:18px;
    }

    .notice-chips{
      display:flex;gap:6px;margin-top:8px;
      overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
      /* The negative margin plus padding gives the first and last chip room
         to keep their focus ring while the row scrolls under the panel edge. */
      margin-left:-2px;margin-right:-2px;padding:2px;
      /* Proximity snapping, not mandatory: letting go mid-chip otherwise
         hides the name that is the only reason the chip exists. */
      scroll-snap-type:x proximity;
    }
    .notice-chips::-webkit-scrollbar{height:0;background:transparent}
    .chip{
      scroll-snap-align:start;flex:none;
      display:flex;align-items:center;gap:6px;
      height:var(--amc-chip-height);padding:0 12px;max-width:190px;
      border:none;border-radius:var(--amc-chip-radius);
      background-color:rgba(var(--amc-notice-rgb),0.16);
      color:rgb(var(--amc-notice-rgb));
      font:inherit;
      font-size:var(--amc-secondary-size);font-weight:var(--amc-primary-weight);
      cursor:pointer;transition:background-color 280ms ease-in-out,color 280ms ease-in-out;
      -webkit-tap-highlight-color:transparent;
    }
    .chip ha-icon{--mdc-icon-size:18px;flex:none;display:flex}
    .chip .chip-label{min-width:0;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
    /* A sensor that closes while the panel is up keeps its chip and turns
       green in place. Removing it instead reflowed the row under the finger
       and changed the count mid-read — and the door just shut is precisely
       the one the user wants confirmation about. */
    .chip.is-clear{
      background-color:rgba(var(--amc-rgb-success),0.16);
      color:rgb(var(--amc-rgb-success));
    }
    /* An entity named in open_sensors can be gone from hass.states entirely —
       renamed, or its integration reloaded. Draw it greyed rather than reading
       attributes off undefined, and take away the tap that would only open an
       empty more-info dialog. */
    .chip.is-missing{
      background-color:rgba(var(--amc-rgb-disabled),0.2);
      color:rgb(var(--amc-rgb-disabled));
      cursor:default;pointer-events:none;
    }
    .chip.more{background-color:transparent;box-shadow:inset 0 0 0 1px rgba(var(--amc-notice-rgb),0.3)}

    /* show_messages:false hides what the panel *says*, never what it can *do*.
       Upstream welded the bypass button inside the message box, so switching
       messages off also removed the only way to arm past an open door
       (nielsfaber/alarmo-card#157, closed unfixed). */
    .notice[data-quiet] .notice-chips{display:none}

    /* ---- bypass action: a sibling of the notice, never a child ---- */
    .notice-actions{
      display:flex;gap:var(--amc-spacing);
      margin:0 var(--amc-control-spacing) var(--amc-control-spacing);
    }
    .bypass{
      flex:1 1 0;
      background-color:rgba(var(--amc-notice-rgb,var(--amc-rgb-warning)),0.2);
      color:rgb(var(--amc-notice-rgb,var(--amc-rgb-warning)));
      overflow:hidden;
    }
    .bypass:hover{background-color:rgba(var(--amc-notice-rgb,var(--amc-rgb-warning)),0.28)}
    /* The confirm step raises the tint rather than going solid: a solid fill
       needs a foreground colour no Home Assistant theme defines, and every
       fixed guess failed contrast in one of the two modes. */
    .bypass[data-confirm]{background-color:rgba(var(--amc-notice-rgb),0.38)}
    .bypass[data-confirm]::after{
      content:"";position:absolute;left:0;bottom:0;height:2px;width:100%;
      background:rgb(var(--amc-notice-rgb));transform-origin:left;
      animation:amc-drain 4s linear forwards;
    }

    /* ---- arm options ---- */
    .arm-options{
      display:flex;gap:6px;flex-wrap:wrap;
      padding:0 var(--amc-control-spacing) var(--amc-control-spacing);
    }
    .opt{
      display:flex;align-items:center;gap:6px;
      height:var(--amc-chip-height);padding:0 12px;
      border:none;border-radius:var(--amc-chip-radius);
      background-color:rgba(var(--amc-rgb-text),0.05);
      color:var(--primary-text-color);
      font:inherit;font-size:var(--amc-secondary-size);font-weight:var(--amc-primary-weight);
      cursor:pointer;transition:background-color 280ms ease-in-out,color 280ms ease-in-out;
      -webkit-tap-highlight-color:transparent;
    }
    .opt ha-icon{--mdc-icon-size:18px;flex:none;display:flex}
    .opt[data-on]{
      background-color:rgba(var(--amc-rgb-warning),0.2);
      color:rgb(var(--amc-rgb-warning));
    }

    /* ---- code entry ---- */
    .code{
      display:flex;flex-direction:column;align-items:center;gap:6px;
      padding:0 var(--amc-control-spacing) var(--amc-control-spacing);
    }
    .code-dots{display:flex;gap:10px;height:20px;align-items:center}
    .code-dots.shake{animation:amc-shake 0.2s ease-in-out 2}
    .code-dot{
      width:10px;height:10px;border-radius:50%;
      background-color:rgba(var(--amc-rgb-text),0.18);
      transition:background-color 180ms ease-in-out,transform 180ms ease-in-out;
    }
    .code-dot[data-filled]{background-color:var(--primary-text-color);transform:scale(1.1)}
    .code-hint{
      font-size:var(--amc-secondary-size);color:var(--secondary-text-color);
      min-height:var(--amc-secondary-line);line-height:var(--amc-secondary-line);
    }
    .code-hint[data-error]{color:rgb(var(--amc-rgb-danger))}
    .code-text{
      width:100%;height:var(--amc-control-height);
      border:none;border-radius:var(--amc-control-radius);
      background-color:rgba(var(--amc-rgb-text),0.05);
      color:var(--primary-text-color);
      font:inherit;font-size:var(--amc-primary-size);text-align:center;
      padding:0 12px;
    }
    .code-text:focus{outline:2px solid rgba(var(--amc-rgb-info),0.5);outline-offset:-2px}

    .keypad{
      display:grid;grid-template-columns:repeat(3,1fr);
      gap:var(--amc-control-spacing);
      padding:0 var(--amc-control-spacing) var(--amc-control-spacing);
      --amc-h:calc(var(--amc-control-height) * var(--amc-scale-keypad,1));
      margin:0 auto;width:100%;
      max-width:calc((var(--amc-h) * 3) + (var(--amc-control-spacing) * 2) + 96px);
    }
    .keypad .control{width:100%}

    /* The readiness dot sits inside the button rather than hanging off its
       corner: at the badge's own 16px it read as an unread-message bubble. */
    .control > .badge{
      top:5px;right:5px;
      width:8px;height:8px;font-size:8px;
    }
    .control > .badge ha-icon{display:none}
    .keypad .digit{font-size:calc(var(--amc-h) * 0.42);font-weight:500}
    .keypad .control.blank{visibility:hidden;pointer-events:none}

    /* ---- code sheet ---- */
    .sheet{
      position:fixed;inset:0;z-index:9;
      display:flex;align-items:flex-end;justify-content:center;
      background:rgba(0,0,0,0.4);
    }
    .sheet-panel{
      width:100%;max-width:420px;
      background:var(--ha-card-background,var(--card-background-color,#fff));
      border-radius:var(--amc-card-radius) var(--amc-card-radius) 0 0;
      padding-top:var(--amc-control-spacing);
      padding-bottom:max(var(--amc-control-spacing),env(safe-area-inset-bottom));
    }
    .sheet-summary{
      text-align:center;padding:0 var(--amc-control-spacing) var(--amc-spacing);
    }
    .sheet-action{
      font-size:var(--amc-primary-size);font-weight:600;
      line-height:var(--amc-primary-line);color:var(--primary-text-color);
    }
    .sheet-detail{
      font-size:var(--amc-secondary-size);line-height:var(--amc-secondary-line);
      color:var(--secondary-text-color);margin-top:2px;
    }
    /* The prompt is the instruction for the thing under the thumb, so it is
       sized like one rather than like a caption. */
    .sheet-title{
      text-align:center;font-size:20px;font-weight:600;line-height:28px;
      color:var(--primary-text-color);padding-bottom:6px;
    }
    @media (min-width:600px){
      .sheet{align-items:center}
      .sheet-panel{border-radius:var(--amc-card-radius);padding-bottom:var(--amc-control-spacing)}
    }

    /* In the sheet the keypad is the whole point of the screen, so the keys
       are sized for a thumb and given a fill of their own. At the card's own
       5% tint they read as empty space with a number floating in it — fine
       inside a dense card, wrong when the keypad is the only thing there. */
    .sheet .keypad{
      --amc-h:calc(60px * var(--amc-scale-keypad,1));
      gap:12px;max-width:312px;
    }
    .sheet .keypad .control{
      background-color:rgba(var(--amc-rgb-text),0.08);
      font-size:var(--amc-h);
    }
    .sheet .keypad .control:hover{background-color:rgba(var(--amc-rgb-text),0.14)}
    .sheet .keypad .control:active{background-color:rgba(var(--amc-rgb-text),0.2)}
    .sheet .keypad .digit{font-size:calc(var(--amc-h) * 0.4);font-weight:500}
    .sheet .keypad ha-icon{--mdc-icon-size:calc(var(--amc-h) * 0.42)}
    /* Confirm reads as the way out, backspace as a correction — the one green,
       the other quiet, so the two never get hit for each other. */
    .key-submit{
      background-color:rgba(var(--amc-rgb-success),0.2) !important;
      color:rgb(var(--amc-rgb-success));
    }
    .key-submit:hover{background-color:rgba(var(--amc-rgb-success),0.28) !important}
    .key-back{color:var(--secondary-text-color)}

    /* ---- messages ---- */
    .message{
      display:flex;align-items:center;gap:var(--amc-spacing);
      padding:var(--amc-control-spacing);
      color:var(--secondary-text-color);font-size:var(--amc-secondary-size);
    }
    .message ha-icon{--mdc-icon-size:20px;flex:none;color:rgb(var(--amc-rgb-warning))}
    .flash{
      text-align:center;font-size:var(--amc-secondary-size);font-weight:500;
      color:rgb(var(--amc-rgb-danger));
      padding:0 var(--amc-control-spacing) var(--amc-spacing);
    }
    [hidden]{display:none !important}

    /* ---- layouts ---- */
    :host([data-layout="vertical"]) .header .state-item{flex-direction:column;text-align:center}
    :host([data-layout="vertical"]) .header .state-info{text-align:center}
    /* Horizontal packs the hero and the buttons onto one line, so the controls
       drop to icon height the way Mushroom's own horizontal layout does. */
    .hrow{display:flex;flex-direction:row;align-items:center}
    .hrow .header{flex:1;min-width:0;padding-right:0}
    .hrow .actions{
      padding-top:var(--amc-control-spacing);
      --amc-h:calc(var(--amc-icon-size) * var(--amc-scale-actions,1));
      --amc-control-spacing:var(--amc-spacing);
      flex:none;
    }
    /* Below this the hero, the name and the buttons stop fitting on one line
       and the row starts eating the name; stacking is the lesser loss. */
    @media (max-width:340px){
      .hrow{flex-direction:column;align-items:stretch}
      .hrow .actions{padding-top:0}
    }

    @media (prefers-reduced-motion:reduce){
      /* The pulse is how a triggered alarm distinguishes itself from an armed
         one at a glance, so it slows to a breath rather than stopping. The
         drain bar keeps its speed: it is a four-second timer, not decoration. */
      .shape,.notice-head > ha-icon{animation-duration:3s !important}
      .ring .arc{transition:none}
      .code-dots.shake{animation:none}
    }
  `;

  /* ------------------------------------------------------------------ */
  /* 7 · Configuration                                                   */
  /* ------------------------------------------------------------------ */

  const DEFAULTS = Object.freeze({
    entity: undefined,
    /* undefined, not '': an explicit empty string is a deliberate "draw no
       name at all", which is different from "fall back to the friendly name". */
    name: undefined,
    /* --- surface inherited from nielsfaber/alarmo-card, unchanged --- */
    keep_keypad_visible: false,
    hide_keypad: false,
    use_code_dialog: false,
    button_scale_actions: 1,
    button_scale_keypad: 1,
    show_messages: true,
    show_ready_indicator: true,
    show_bypassed_sensors: true,
    states: {},
    /* --- added by this card --- */
    language: 'auto',
    layout: 'default',
    fill_container: false,
    icon_type: 'icon',
    show_bypass_button: true,
    confirm_bypass: true,
    show_force_option: true,
    show_skip_delay_option: true,
    button_content: 'icon_and_name',
    max_sensor_chips: 6
  });

  const MIN_SCALE = 1;
  const MAX_SCALE = 2.5;

  function normalizeConfig(raw) {
    const config = Object.assign({}, DEFAULTS, raw || {});

    if (!config.entity) throw new Error(tLang(DEFAULT_LANG, 'card.no_entity'));
    if (String(config.entity).split('.')[0] !== 'alarm_control_panel') {
      throw new Error('alarmo-mushroom-card: entity must be an alarm_control_panel');
    }

    /* Legacy button_scale seeded both scales. It is migrated on load and never
       written back, so the key evaporates the first time the editor saves. */
    if (raw && raw.button_scale !== undefined) {
      if (raw.button_scale_actions === undefined) config.button_scale_actions = raw.button_scale;
      if (raw.button_scale_keypad === undefined) config.button_scale_keypad = raw.button_scale;
      delete config.button_scale;
    }
    config.button_scale_actions = clamp(config.button_scale_actions, MIN_SCALE, MAX_SCALE);
    config.button_scale_keypad = clamp(config.button_scale_keypad, MIN_SCALE, MAX_SCALE);
    config.max_sensor_chips = Math.round(clamp(config.max_sensor_chips, 1, 30));

    if (!['default', 'horizontal', 'vertical'].includes(config.layout)) config.layout = 'default';
    if (!['icon', 'none'].includes(config.icon_type)) config.icon_type = 'icon';
    if (!['icon_and_name', 'icon', 'name'].includes(config.button_content)) {
      config.button_content = 'icon_and_name';
    }
    /* show_arm_options used to switch both shortcuts at once. It is migrated
       rather than kept, so a config written against it keeps behaving the same
       without the card carrying two ways to say one thing. */
    if (raw && raw.show_arm_options === false) {
      if (raw.show_force_option === undefined) config.show_force_option = false;
      if (raw.show_skip_delay_option === undefined) config.show_skip_delay_option = false;
    }
    delete config.show_arm_options;

    /* States are rebuilt rather than passed through: a typo like
       states.armed_hom is silently accepted upstream and simply never applies,
       which is a very quiet way to lose an afternoon. */
    const states = {};
    const raws = config.states || {};
    for (const key of Object.keys(raws)) {
      if (!STATE_KEYS.includes(key)) {
        throw new Error('alarmo-mushroom-card: unknown state "' + key + '" in states');
      }
      const from = raws[key] || {};
      const to = {};
      if (from.state_label !== undefined) to.state_label = from.state_label;
      if (from.color !== undefined) to.color = from.color;
      if (!TRANSIENT_STATES.includes(key)) {
        if (from.button_label !== undefined) to.button_label = from.button_label;
        if (from.button_icon !== undefined) to.button_icon = from.button_icon;
        if (from.button_order !== undefined) to.button_order = Number(from.button_order);
        if (from.hide !== undefined) to.hide = normalizeHide(from.hide);
      }
      states[key] = to;
    }
    config.states = states;
    return config;
  }

  /* Upstream accepts a boolean or one of four strings and its editor maps the
     two representations inconsistently. The stored values stay byte-identical
     to upstream so YAML round-trips; only the editor's labels are rewritten. */
  function normalizeHide(value) {
    if (value === true) return 'always';
    if (value === false || value === undefined || value === null) return 'never';
    const s = String(value);
    return HIDE_MODES.includes(s) ? s : 'never';
  }

  /* 'armed'  -> hidden while armed,    i.e. shown only while disarmed
     'disarmed' -> hidden while disarmed, i.e. shown only while armed
     The config value names when the button is HIDDEN. */
  function isButtonVisible(hide, isDisarmed) {
    switch (hide) {
      case 'always': return false;
      case 'armed': return isDisarmed;
      case 'disarmed': return !isDisarmed;
      default: return true;
    }
  }

  function stateBlock(config, state) {
    return (config.states && config.states[state]) || {};
  }

  /* Mushroom collapses every armed_* into one colour by taking the segment
     before the first underscore. Keeping that means a house that arms home in
     the evening and away in the morning does not change colour between them. */
  function stateColorVar(state) {
    switch (String(state).split('_')[0]) {
      case 'disarmed': return 'var(--amc-rgb-disarmed)';
      case 'armed': return 'var(--amc-rgb-armed)';
      case 'triggered': return 'var(--amc-rgb-triggered)';
      /* Mushroom drops arming and pending into grey because its map has no
         entry for them. Warning is the truer reading: something is counting
         down and the user may still want to act on it. */
      case 'arming':
      case 'pending': return 'var(--amc-rgb-warning)';
      case 'unavailable':
      case 'unknown': return 'var(--amc-rgb-warning)';
      default: return 'var(--amc-rgb-grey)';
    }
  }

  const NAMED_COLORS = new Set([
    'primary', 'accent', 'red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue',
    'light-blue', 'cyan', 'teal', 'green', 'light-green', 'lime', 'yellow', 'amber',
    'orange', 'deep-orange', 'brown', 'light-grey', 'grey', 'dark-grey', 'blue-grey',
    'black', 'white', 'disabled'
  ]);

  const colorCache = new Map();

  /* Accepts what upstream accepted: a Home Assistant colour name, a bare
     "r, g, b" triplet, or any CSS colour. Anything that has to be parsed goes
     through the browser once and is memoized — getComputedStyle needs a live
     document, so this can never run at module scope. */
  function toRgbTriplet(color) {
    if (!color) return null;
    const key = String(color).trim();
    if (colorCache.has(key)) return colorCache.get(key);
    let result = null;
    if (NAMED_COLORS.has(key)) {
      result = key === 'primary' || key === 'accent'
        ? 'var(--rgb-primary-color)'
        : 'var(--rgb-' + key + ')';
    } else if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(key)) {
      result = key.replace(/\s+/g, '');
    } else if (typeof document !== 'undefined') {
      const probe = document.createElement('span');
      probe.style.display = 'none';
      probe.style.color = key;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(computed);
      if (match) result = match[1] + ',' + match[2] + ',' + match[3];
    }
    colorCache.set(key, result);
    return result;
  }

  function supportedArmModes(stateObj) {
    const features = (stateObj && stateObj.attributes && stateObj.attributes.supported_features) || 0;
    return ARM_MODES.filter(function (m) { return (features & m.bit) !== 0; });
  }

  /* ------------------------------------------------------------------ */
  /* 8 · The card                                                        */
  /* ------------------------------------------------------------------ */

  const RING_CIRCUMFERENCE = 138.23; /* 2 * PI * 22, the ring radius below */
  const CODE_IDLE_MS = 120000;
  const FLASH_MS = 4000;
  const CONFIRM_MS = 4000;
  const PENDING_STALE_MS = 60000;

  class AlarmoMushroomCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = null;
      this._hass = null;
      this._shellSig = null;
      this._varCache = new Map();
      this._nodeCache = new Map();
      this._areaId = null;
      this._backendOk = null;   /* null = still handshaking */
      this._alarmoConfig = null;
      this._readyModes = null;
      this._sensorCount = null;
      this._modes = null;
      this._unsubs = null;
      this._subscribing = false;
      this._code = '';
      this._codeError = false;
      this._flash = '';
      this._pending = null;     /* {mode, code, at} after a failed arm */
      this._armOptions = { force: false, skip_delay: false };
      this._confirming = false;
      this._expanded = false;
      this._sheetOpen = false;
      this._deadline = 0;
      this._delay = 0;
      this._tickTimer = null;
      this._flashTimer = null;
      this._confirmTimer = null;
      this._codeTimer = null;
      this._themeKey = '';
      this._offscreen = false;
      this._onClick = this._onClick.bind(this);
      this._onKeydown = this._onKeydown.bind(this);
      this._onVisibility = this._onVisibility.bind(this);
    }

    /* ---- Home Assistant contract ---- */

    static getConfigElement() {
      return document.createElement(EDITOR_TYPE);
    }

    static getStubConfig(hass) {
      const first = hass
        ? Object.keys(hass.states).find(function (id) { return id.startsWith('alarm_control_panel.'); })
        : undefined;
      return { entity: first || 'alarm_control_panel.alarmo' };
    }

    getCardSize() {
      return 4;
    }

    /* Called before hass exists on some layout paths, so nothing here may read
       the entity — a throw at this point drops the card out of a sections view
       entirely rather than showing an error.

       rows is 'auto', never a number. A numeric rows earns the card the
       fit-rows class, which pins it to exactly
       rows * (row-height + row-gap) - row-gap pixels
       (hui-grid-section.ts). This card's height is not knowable in advance: the
       open-sensor panel, the bypass button, the shortcut chips and the keypad
       each appear and disappear with state, and a fixed guess had the card
       spilling out of its cell and drawing on top of its neighbours in edit
       mode. 'auto' lets the grid take the height the card actually has. */
    getGridOptions() {
      const config = this._config;
      if (config && config.layout === 'horizontal') {
        return { rows: 'auto', min_rows: 1, columns: 12, min_columns: 6 };
      }
      return { rows: 'auto', min_rows: 2, columns: 12, min_columns: 4 };
    }

    /* Home Assistant before 2024.11 asks this instead, with the same meaning
       carried under grid_* names. */
    getLayoutOptions() {
      const config = this._config;
      if (config && config.layout === 'horizontal') {
        return { grid_rows: 'auto', grid_min_rows: 1, grid_columns: 12, grid_min_columns: 6 };
      }
      return { grid_rows: 'auto', grid_min_rows: 2, grid_columns: 12, grid_min_columns: 4 };
    }

    setConfig(config) {
      this._config = normalizeConfig(config);
      this._shellSig = null;      /* force a full rebuild, styles included */
      this._varCache.clear();
      this._nodeCache.clear();
      this._trackedCache = null;
      this._backendOk = null;
      this._alarmoConfig = null;
      this._readyModes = null;
      this._sensorCount = null;
      this._modes = null;
      this._areaId = null;
      this._expanded = false;
      this._clearCode();
      if (this._hass) this._bootstrap();
      this._render();
    }

    set hass(hass) {
      const prev = this._hass;
      this._hass = hass;
      if (!this._config) return;
      if (!prev) {
        this._bootstrap();
        this._render();
        return;
      }
      if (this._trackedChanged(prev, hass)) this._render();
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      this.shadowRoot.addEventListener('click', this._onClick);
      this.addEventListener('keydown', this._onKeydown);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this._onVisibility);
      }
      if (typeof IntersectionObserver !== 'undefined' && !this._observer) {
        this._observer = new IntersectionObserver(function (entries) {
          for (const entry of entries) {
            this._offscreen = !entry.isIntersecting;
            /* A card scrolled out of view keeps its countdown honest by
               reading the clock on the way back rather than by ticking into
               an offscreen DOM once a second for the whole scroll. */
            if (this._offscreen) this._stopTick();
            else this._syncDeadline();
          }
        }.bind(this), { threshold: 0 });
        this._observer.observe(this);
      }
      if (typeof ResizeObserver !== 'undefined' && !this._resize) {
        /* A card can be resized without any state changing — a sidebar opening,
           a phone rotating — and the row has to re-decide then too. */
        this._resize = new ResizeObserver(function () { this._syncDensity(); }.bind(this));
        this._resize.observe(this);
      }
      if (this._config && this._hass) this._bootstrap();
    }

    disconnectedCallback() {
      this.shadowRoot.removeEventListener('click', this._onClick);
      this.removeEventListener('keydown', this._onKeydown);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibility);
      }
      if (this._observer) { this._observer.disconnect(); this._observer = null; }
      if (this._resize) { this._resize.disconnect(); this._resize = null; }
      this._stopTick();
      clearTimeout(this._flashTimer); this._flashTimer = null;
      clearTimeout(this._confirmTimer); this._confirmTimer = null;
      clearTimeout(this._codeTimer); this._codeTimer = null;
      if (this._unsubs) {
        for (const off of this._unsubs) {
          try { off(); } catch (error) { /* the socket was already gone */ }
        }
        this._unsubs = null;
      }
    }

    /* ---- data ---- */

    _t(key, fallback) {
      return tLang(this._lang(), key, fallback);
    }

    _lang() {
      return resolveLanguage(this._config ? this._config.language : 'auto', this._hass);
    }

    _stateObj() {
      if (!this._hass || !this._config) return null;
      return this._hass.states[this._config.entity] || null;
    }

    _attrs() {
      const stateObj = this._stateObj();
      return (stateObj && stateObj.attributes) || {};
    }

    /* The sensor ids named by the panel right now. Only the keys are used —
       the state stored alongside each name in open_sensors is a snapshot from
       the moment the arm failed and never updates, so trusting it would freeze
       every chip at "open" for as long as the panel is on screen. */
    _sensorIds(stateObj) {
      const attrs = (stateObj && stateObj.attributes) || {};
      const open = attrs.open_sensors ? Object.keys(attrs.open_sensors) : [];
      const bypassed = Array.isArray(attrs.bypassed_sensors) ? attrs.bypassed_sensors : [];
      const all = open.slice();
      for (const id of bypassed) if (!all.includes(id)) all.push(id);
      return all;
    }

    _trackedChanged(prev, next) {
      if (prev === next) return false;
      if (!prev || !next) return true;
      if (prev.language !== next.language) return true;
      if ((prev.locale && prev.locale.language) !== (next.locale && next.locale.language)) return true;
      if (prev.themes !== next.themes) return true;
      const id = this._config.entity;
      const before = prev.states[id];
      const after = next.states[id];
      /* Home Assistant reuses the state object when nothing about an entity
         changed, so identity is a sufficient and O(1) test. */
      if (before !== after) return true;
      for (const sid of this._sensorIds(after)) {
        if (prev.states[sid] !== next.states[sid]) return true;
      }
      return false;
    }

    /* ---- backend ---- */

    async _bootstrap() {
      await this._loadBackend();
      this._subscribe();
      this._render();
    }

    async _loadBackend() {
      if (!this._hass || !this._config) return;
      if (this._backendOk !== null) return;
      try {
        const entries = await this._hass.callWS({ type: WS.entities });
        const mine = (entries || []).find(function (e) {
          return e.entity_id === this._config.entity;
        }.bind(this));
        if (!mine) {
          /* The entity exists in Home Assistant but Alarmo does not claim it.
             That is a different failure from "Alarmo is missing", and saying
             so is the difference between checking the card and checking HACS. */
          this._backendOk = false;
          this._backendReason = 'card.not_alarmo';
          return;
        }
        this._areaId = mine.area_id;
        this._alarmoConfig = await this._hass.callWS({ type: WS.config });
        /* How many sensors Alarmo knows about at all. Without this the
           readiness list below cannot be read — see _modeReady. */
        try {
          const sensors = await this._hass.callWS({ type: WS.sensors });
          this._sensorCount = sensors ? Object.keys(sensors).length : 0;
        } catch (error) {
          this._sensorCount = null;
        }
        try {
          /* Per-mode exit delays live in the area config, not on the entity —
             the entity only publishes `delay` once a countdown is already
             running, which is too late to warn anyone about it. */
          const areas = await this._hass.callWS({ type: WS.areas });
          const area = areas && this._areaId ? areas[this._areaId] : null;
          this._modes = (area && area.modes) || null;
        } catch (error) {
          this._modes = null;
        }
        this._backendOk = true;
      } catch (error) {
        this._backendOk = false;
        this._backendReason = 'card.backend_missing';
        return;
      }
      await this._loadReadyModes();
    }

    async _loadReadyModes() {
      if (!this._hass || !this._config) return;
      try {
        const res = await this._hass.callWS({
          type: WS.readyModes, entity_id: this._config.entity
        });
        this._readyModes = res ? res.modes : null;
      } catch (error) {
        /* Older Alarmo builds do not serve this command. Losing the readiness
           dot is a cosmetic downgrade; losing the card is not, so this failure
           stays local instead of flipping _backendOk. */
        this._readyModes = null;
      }
    }

    async _subscribe() {
      if (this._unsubs || this._subscribing || !this._hass) return;
      /* connectedCallback can fire again while the awaits below are in flight.
         Without this flag that produces two subscriptions and doubled events,
         which shows up as the code field clearing itself twice. */
      this._subscribing = true;
      const handler = this._onAlarmoEvent.bind(this);
      const unsubs = [];
      for (const name of Object.keys(BUS_EVENTS)) {
        try {
          unsubs.push(await this._hass.connection.subscribeEvents(
            handler, BUS_EVENTS[name]
          ));
        } catch (error) {
          /* One event type refusing is not a reason to lose the others. */
        }
      }
      this._unsubs = unsubs.length ? unsubs : null;
      this._subscribing = false;
    }

    _onAlarmoEvent(ev) {
      const data = (ev && ev.data) || {};
      /* Alarmo fires per area, naming the area's own entity. Matching either
         field keeps the card working whether it points at an area panel or at
         the master, whose area_id is not the one the event carries. */
      if (data.entity_id && data.area_id
          && data.entity_id !== this._config.entity
          && data.area_id !== this._areaId) return;

      switch (ev && ev.event_type) {
        case BUS_EVENTS.success:
          this._clearPending();
          this._clearCode();
          /* The code was accepted, so the sheet has nothing left to ask. */
          this._sheetOpen = false;
          this._sheetMode = null;
          break;

        case BUS_EVENTS.failed:
          /* One event carries four outcomes; `reason` is what separates them. */
          if (data.reason === REASON.invalidCode) {
            this._flashMessage(this._t('errors.invalid_pin'), true);
            this._code = '';
          } else if (data.reason === REASON.notAllowed) {
            this._flashMessage(this._t('errors.not_allowed'), true);
          } else {
            /* command arrives as "arm_away"; the service wants "armed_away". */
            this._pending = {
              mode: String(data.command || '').replace(/^arm_/, 'armed_'),
              code: this._code,
              at: Date.now()
            };
            this._flashMessage(this._t('errors.failed_to_arm'));
            this._code = '';
          }
          break;

        case BUS_EVENTS.readyModes:
          /* Not a list: a boolean per supported mode, keyed by state name. */
          this._readyModes = Object.keys(data).filter(function (key) {
            return key.indexOf('armed_') === 0 && data[key] === true;
          });
          break;

        default:
          break;
      }
      this._render();
    }

    /* ---- render model ---- */

    _render() {
      if (!this._config) return;
      this._syncTheme();
      const sig = this._shellSignature();
      if (sig !== this._shellSig) {
        this._shellSig = sig;
        this._renderShell();
      }
      this._paint();
      this._syncDeadline();
    }

    /* Everything that changes the *shape* of the DOM. Anything that only
       changes a value belongs in _paint() instead, or the card rebuilds its
       whole tree once a second while a countdown runs. */
    _shellSignature() {
      const stateObj = this._stateObj();
      const state = stateObj ? stateObj.state : 'missing';
      const family = String(state).split('_')[0];
      return [
        this._lang(),
        this._config.entity,
        this._backendOk,
        family,
        this._visibleModes().map(function (m) { return m.key; }).join(','),
        this._noticeKind(),
        this._noticeSensors().map(function (s) { return s.id; }).join(','),
        this._expanded,
        this._config.button_content,
        this._codeVisible() + ':' + this._keypadVisible(),
        this._sheetOpen,
        this._config.show_force_option + ':' + this._config.show_skip_delay_option
          + ':' + (state === 'disarmed')
      ].join('|');
    }

    _renderShell() {
      const parts = [
        '<style>', TOKENS_CSS, PRIMITIVES_CSS, CARD_CSS, '</style>',
        this._cardHtml()
      ];
      this.shadowRoot.innerHTML = parts.join('');
      this._varCache.clear();
      this._nodeCache.clear();
    }

    _cardHtml() {
      if (!this._hass) return '<ha-card></ha-card>';
      const stateObj = this._stateObj();
      if (!stateObj) return this._messageHtml(this._t('card.entity_missing'));
      if (this._backendOk === false) {
        return this._messageHtml(this._t(this._backendReason || 'card.backend_missing'));
      }
      const cls = this._config.fill_container ? 'fill' : '';
      const tail = [
        '<div class="flash" id="flash" hidden></div>',
        this._codeHtml(),
        this._keypadHtml(),
        this._sheetHtml()
      ].join('');
      /* Horizontal means the hero and the buttons share a line, not that every
         section becomes a column of the card — turning ha-card itself into a
         row put the notice and the keypad side by side with the header. Only
         the two that belong together are paired. */
      if (this._config.layout === 'horizontal') {
        return '<ha-card class="' + cls + '">'
          + '<div class="hrow">' + this._headerHtml() + this._actionsHtml() + '</div>'
          + this._noticeHtml() + this._noticeActionsHtml() + this._armOptionsHtml()
          + tail + '</ha-card>';
      }
      /* Everywhere else the reason comes before the buttons it is about:
         reading "cannot arm yet" after already having chosen a mode is reading
         it too late. */
      return '<ha-card class="' + cls + '">'
        + this._headerHtml()
        + this._noticeHtml() + this._noticeActionsHtml() + this._armOptionsHtml()
        + this._actionsHtml()
        + tail + '</ha-card>';
    }

    _messageHtml(text) {
      return '<ha-card><div class="message"><ha-icon icon="mdi:alert-outline"></ha-icon>'
        + '<span>' + esc(text) + '</span></div></ha-card>';
    }

    _headerHtml() {
      const showIcon = this._config.icon_type !== 'none';
      const hero = showIcon ? [
        '<div class="hero">',
        '<svg class="ring" id="ring" viewBox="0 0 48 48" hidden>',
        '<circle class="track" cx="24" cy="24" r="22"></circle>',
        '<circle class="arc" id="ring-arc" cx="24" cy="24" r="22"></circle>',
        '</svg>',
        '<div class="shape" id="hero-shape"><ha-icon id="hero-icon"></ha-icon></div>',
        '<div class="badge" id="hero-badge" hidden><ha-icon icon="mdi:alert"></ha-icon></div>',
        '<div class="countdown-value" id="countdown" hidden>',
        '<span class="digits" id="countdown-digits"></span>',
        '<ha-icon icon="mdi:skip-forward"></ha-icon>',
        '</div>',
        '</div>'
      ].join('') : '';
      const vertical = this._config.layout === 'vertical' ? ' vertical' : '';
      return [
        '<div class="header">',
        '<div class="state-item' + vertical + '" data-act="hero" role="button" tabindex="0">',
        hero,
        '<div class="state-info">',
        '<span class="primary" id="primary"></span>',
        '<span class="secondary" id="secondary"></span>',
        '</div>',
        '</div>',
        '</div>'
      ].join('');
    }

    /* ---- mode buttons ---- */

    _visibleModes() {
      const config = this._config;
      const stateObj = this._stateObj();
      if (!config || !stateObj) return [];
      const isDisarmed = stateObj.state === 'disarmed';
      const list = [];

      /* Default behaviour follows Mushroom: the arm modes while disarmed, a
         single disarm button otherwise. An explicit `hide` in the config wins,
         so an upstream YAML asking for the old always-visible segmented row
         still gets exactly that. */
      const disarmBlock = stateBlock(config, 'disarmed');
      const disarmVisible = disarmBlock.hide !== undefined
        ? isButtonVisible(disarmBlock.hide, isDisarmed)
        : !isDisarmed;
      if (disarmVisible) {
        list.push({
          key: 'disarmed',
          icon: disarmBlock.button_icon || DISARM_ICON,
          label: disarmBlock.button_label !== undefined
            ? disarmBlock.button_label : this._t('button.disarm'),
          order: disarmBlock.button_order,
          arms: false
        });
      }

      for (const m of supportedArmModes(stateObj)) {
        const block = stateBlock(config, m.state);
        const visible = block.hide !== undefined
          ? isButtonVisible(block.hide, isDisarmed)
          : isDisarmed;
        if (!visible) continue;
        list.push({
          key: m.state,
          icon: block.button_icon || m.icon,
          label: block.button_label !== undefined
            ? block.button_label : this._t('button.' + m.state),
          order: block.button_order,
          arms: true
        });
      }

      /* A button without an order keeps its natural position rather than being
         pushed behind everything that has one. Setting button_order: 9 on a
         single mode has to put it ninth — sorting every ordered item ahead of
         every unordered one instead sent it to the front, which is the exact
         opposite of what the number says. Where the visual editor has written
         an order for every button the two rules agree. */
      return list
        .map(function (item, index) {
          const raw = Number(item.order);
          return {
            item: item,
            index: index,
            key: (item.order !== undefined && isFinite(raw)) ? raw : index
          };
        })
        .sort(function (a, b) {
          if (a.key !== b.key) return a.key - b.key;
          return a.index - b.index;   /* stable: ties keep declaration order */
        })
        .map(function (w) { return w.item; });
    }

    _actionsHtml() {
      const modes = this._visibleModes();
      if (!modes.length) return '';
      const horizontal = this._config.layout === 'horizontal';
      const content = this._config.button_content;
      /* Every label empty is how upstream asked for an icon-only row, and that
         config keeps working here. Horizontal joins them by force unless the
         config says otherwise — the hero, the name and four labelled modes do
         not fit on one line, and letting them try pushed the last button clean
         off the card. */
      const iconOnly = content === 'icon'
        || (content === 'icon_and_name'
            && (horizontal || modes.every(function (m) { return !m.label; })));
      const nameOnly = content === 'name';
      const hug = horizontal ? ' hug' : '';
      const buttons = modes.map(function (m) {
        return [
          '<button class="control' + (iconOnly ? ' icon-only' : '') + '"',
          ' id="mode-' + esc(m.key) + '" data-act="mode" data-mode="' + esc(m.key) + '">',
          nameOnly ? '' : '<ha-icon icon="' + esc(m.icon) + '"></ha-icon>',
          iconOnly ? '' : '<span class="label">' + esc(m.label) + '</span>',
          '<span class="badge" id="ready-' + esc(m.key) + '" hidden>',
          '<ha-icon icon="mdi:circle-medium"></ha-icon></span>',
          '</button>'
        ].join('');
      }).join('');
      return '<div class="actions"><div class="button-group' + hug + '">' + buttons + '</div></div>';
    }

    _armOptionsHtml() {
      const stateObj = this._stateObj();
      if (!stateObj || stateObj.state !== 'disarmed') return '';
      /* While the bypass button is on screen it already offers the force path,
         and offering it twice invites the user to wonder how the two differ. */
      const withForce = this._config.show_force_option && !this._bypassAvailable();
      const withSkip = this._config.show_skip_delay_option;
      if (!withForce && !withSkip) return '';
      /* Upstream buried these in a kebab menu pinned to the corner, which it
         then had to hide below 250px. Two toggles fit on a line. */
      return [
        '<div class="arm-options">',
        withForce ? '<button class="opt" id="opt-force" data-act="opt" data-opt="force">'
          + '<ha-icon icon="mdi:shield-off-outline"></ha-icon>'
          + '<span>' + esc(this._t('arm_options.force')) + '</span></button>' : '',
        withSkip ? '<button class="opt" id="opt-skip" data-act="opt" data-opt="skip_delay">'
          + '<ha-icon icon="mdi:timer-off-outline"></ha-icon>'
          + '<span>' + esc(this._t('arm_options.skip_delay')) + '</span></button>' : '',
        '</div>'
      ].join('');
    }

    /* ---- open-sensor notice ---- */

    _noticeKind() {
      const stateObj = this._stateObj();
      if (!stateObj) return null;
      const attrs = stateObj.attributes || {};
      const open = attrs.open_sensors ? Object.keys(attrs.open_sensors) : [];
      const bypassed = Array.isArray(attrs.bypassed_sensors) ? attrs.bypassed_sensors : [];
      if (stateObj.state === 'triggered' && open.length) return 'triggered';
      if (open.length) {
        /* Every open sensor having closed again turns the panel green and the
           action into a plain retry. Upstream kept showing a red box listing
           sensors that were no longer open, which reads as a stuck card. */
        return this._allClear() ? 'ready' : 'blocked';
      }
      if (bypassed.length && this._config.show_bypassed_sensors
          && String(stateObj.state).startsWith('armed_')) return 'bypassed';
      return null;
    }

    _noticeSensors() {
      const stateObj = this._stateObj();
      if (!stateObj) return [];
      const attrs = stateObj.attributes || {};
      const kind = this._noticeKind();
      const ids = kind === 'bypassed'
        ? (Array.isArray(attrs.bypassed_sensors) ? attrs.bypassed_sensors : [])
        : (attrs.open_sensors ? Object.keys(attrs.open_sensors) : []);
      const bypassed = Array.isArray(attrs.bypassed_sensors) ? attrs.bypassed_sensors : [];
      return ids.map(function (id) {
        /* The live state, never the snapshot stored beside the name in
           open_sensors — that value is frozen at the moment the arm failed. */
        const obj = this._hass ? this._hass.states[id] : null;
        const isOpen = obj ? (obj.state === 'on' || obj.state === 'open'
          || obj.state === 'unlocked' || obj.state === 'detected') : false;
        const deviceClass = obj && obj.attributes ? obj.attributes.device_class : null;
        const pair = SENSOR_ICONS[deviceClass] || SENSOR_ICONS._default;
        const isBypassed = bypassed.includes(id);
        let sub;
        if (!obj) sub = this._t('notice.sensor_missing');
        else if (isBypassed) sub = this._t('notice.sensor_bypassed');
        else sub = this._t(isOpen ? 'notice.sensor_open' : 'notice.sensor_closed');
        return {
          id: id,
          name: obj && obj.attributes && obj.attributes.friendly_name
            ? obj.attributes.friendly_name : id.split('.').pop().replace(/_/g, ' '),
          icon: (obj && obj.attributes && obj.attributes.icon) || (isOpen ? pair[0] : pair[1]),
          sub: sub,
          clear: !!obj && !isOpen,
          missing: !obj
        };
      }.bind(this));
    }

    _allClear() {
      const sensors = this._openSensorList();
      return sensors.length > 0 && sensors.every(function (s) { return s.clear; });
    }

    _openSensorList() {
      const attrs = this._attrs();
      const ids = attrs.open_sensors ? Object.keys(attrs.open_sensors) : [];
      return ids.map(function (id) {
        const obj = this._hass ? this._hass.states[id] : null;
        const isOpen = obj ? (obj.state === 'on' || obj.state === 'open'
          || obj.state === 'unlocked' || obj.state === 'detected') : false;
        /* A sensor that vanished cannot be confirmed shut, so it does not
           count towards "all clear" — otherwise a renamed entity silently
           downgrades the bypass button into a plain arm. */
        return { id: id, clear: !!obj && !isOpen };
      }.bind(this));
    }

    _noticeHtml() {
      const kind = this._noticeKind();
      if (!kind) return '';
      const quiet = this._config.show_messages ? '' : ' data-quiet';
      const sensors = this._noticeSensors();
      const limit = this._expanded ? sensors.length : this._config.max_sensor_chips;
      const shown = sensors.slice(0, limit);
      const hidden = sensors.length - shown.length;
      const chips = shown.map(function (s, i) {
        const cls = 'chip' + (s.missing ? ' is-missing' : (s.clear ? ' is-clear' : ''));
        return [
          '<button class="' + cls + '" id="chip-' + i + '"',
          ' data-act="sensor" data-entity="' + esc(s.id) + '" title="' + esc(s.name + ' — ' + s.sub) + '">',
          '<ha-icon id="chip-icon-' + i + '" icon="' + esc(s.icon) + '"></ha-icon>',
          '<span class="chip-label">' + esc(s.name) + '</span>',
          '</button>'
        ].join('');
      }).join('');
      const more = hidden > 0
        ? '<button class="chip more" data-act="expand"><span class="chip-label">'
          + esc(this._t('notice.more').replace('{n}', String(hidden))) + '</span></button>'
        : '';
      return [
        '<div class="notice" id="notice" data-kind="' + esc(kind) + '"' + quiet + '>',
        '<div class="notice-head">',
        '<ha-icon id="notice-icon"></ha-icon>',
        '<span class="notice-title" id="notice-title"></span>',
        '<span class="notice-count" id="notice-count"></span>',
        '</div>',
        '<div class="notice-chips">' + chips + more + '</div>',
        '</div>'
      ].join('');
    }

    /* The bypass action is a sibling of the panel, never a child of it, so
       show_messages can silence the list without taking away the only way to
       arm past an open door (nielsfaber/alarmo-card#157). */
    _noticeActionsHtml() {
      if (!this._bypassAvailable()) return '';
      return [
        '<div class="notice-actions" data-kind="' + esc(this._noticeKind()) + '">',
        '<button class="control bypass" id="bypass" data-act="bypass">',
        '<ha-icon id="bypass-icon" icon="mdi:shield-off-outline"></ha-icon>',
        '<span class="label" id="bypass-label"></span>',
        '</button>',
        '</div>'
      ].join('');
    }

    /* Only offered once a real arm attempt has told us which mode to retry.
       Without a target mode the button would have to guess, and guessing which
       way to arm a house is not a thing a button should do. */
    _bypassAvailable() {
      if (!this._config.show_bypass_button) return false;
      if (!this._pending || !this._pending.mode) return false;
      const kind = this._noticeKind();
      return kind === 'blocked' || kind === 'ready';
    }

    /* ---- code entry ---- */

    _codeRequired() {
      const cfg = this._alarmoConfig;
      if (!cfg) return false;
      const stateObj = this._stateObj();
      if (!stateObj) return false;
      return stateObj.state === 'disarmed' ? !!cfg.code_arm_required : !!cfg.code_disarm_required;
    }

    _codeVisible() {
      if (this._config.use_code_dialog) return false;
      return this._codeRequired() || this._config.keep_keypad_visible;
    }

    _keypadVisible() {
      if (!this._codeVisible() || this._config.hide_keypad) return false;
      return !!(this._alarmoConfig && this._alarmoConfig.code_format === 'number');
    }

    _codeHtml() {
      if (!this._codeVisible()) return '';
      const numeric = this._alarmoConfig && this._alarmoConfig.code_format === 'number';
      if (!numeric) {
        return [
          '<div class="code">',
          '<input class="code-text" id="code-text" type="password" inputmode="text"',
          ' autocomplete="off" placeholder="' + esc(this._t('keypad.enter_code')) + '">',
          '<span class="code-hint" id="code-hint"></span>',
          '</div>'
        ].join('');
      }
      /* Filled dots rather than a password field: the digit count is the only
         thing worth showing, and a native input on a wall tablet drags up the
         on-screen keyboard over the card's own keypad. */
      return [
        '<div class="code">',
        '<div class="code-dots" id="code-dots"></div>',
        '<span class="code-hint" id="code-hint"></span>',
        '</div>'
      ].join('');
    }

    _keypadHtml() {
      if (!this._keypadVisible()) return '';
      return '<div class="keypad">' + this._keysHtml() + '</div>';
    }

    _keysHtml(withSubmit) {
      /* The sheet gets the phone-keypad bottom row — backspace, zero, confirm —
         so the commit key sits under the thumb on the right instead of hanging
         off a fifth row on its own. Inline has no confirm: pressing a mode
         button is what submits there. */
      const keys = withSubmit
        ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'submit']
        : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
      return keys.map(function (key) {
        if (key === '') return '<button class="control blank" tabindex="-1"></button>';
        if (key === 'submit') {
          return '<button class="control key-submit" data-act="submit"'
            + ' aria-label="' + esc(this._t('keypad.submit')) + '">'
            + '<ha-icon icon="mdi:check"></ha-icon></button>';
        }
        if (key === 'back') {
          /* Backspace, not clear-all. Upstream only offered clear, which after
             a mistyped fourth digit throws away three correct ones. Hold to
             wipe the whole code is kept for the people who want that. */
          return '<button class="control key-back" data-act="key" data-key="back"'
            + ' aria-label="' + esc(this._t('keypad.backspace')) + '">'
            + '<ha-icon icon="mdi:backspace-outline"></ha-icon></button>';
        }
        return '<button class="control" data-act="key" data-key="' + key + '">'
          + '<span class="digit">' + key + '</span></button>';
      }.bind(this)).join('');
    }

    _sheetHtml() {
      if (!this._sheetOpen) return '';
      /* Home Assistant's own code dialog lives behind a private frontend
         module that only a bundler import can reach; every card that hardcoded
         its path has had to chase a rename. This sheet is ours, so it stays
         working across frontend releases. */
      return [
        '<div class="sheet" data-act="sheet-backdrop">',
        '<div class="sheet-panel" data-act="sheet-panel">',
        this._sheetSummaryHtml(),
        '<div class="sheet-title">' + esc(this._t('keypad.enter_code')) + '</div>',
        '<div class="code"><div class="code-dots" id="sheet-dots"></div>',
        '<span class="code-hint" id="sheet-hint"></span></div>',
        '<div class="keypad">' + this._keysHtml(true) + '</div>',
        '</div></div>'
      ].join('');
    }

    /* A code prompt with no context is a code prompt for something you have to
       remember you asked for. This says which alarm, which mode, how long the
       exit delay is, and whether anything is being bypassed — the three things
       that change what happens after the last digit. */
    _sheetSummaryHtml() {
      const stateObj = this._stateObj();
      if (!stateObj) return '';
      const mode = this._sheetMode;
      const name = this._nameText(stateObj) || this._config.entity;
      let action;
      if (!mode || mode === 'disarmed') {
        action = this._t('sheet.disarming').replace('{name}', name);
      } else {
        action = this._t('sheet.arming')
          .replace('{name}', name)
          .replace('{mode}', this._modeLabel(mode));
      }

      const details = [];
      const modeCfg = this._modes && mode ? this._modes[mode] : null;
      const exit = modeCfg ? Number(modeCfg.exit_time) : 0;
      if (mode && mode !== 'disarmed' && exit > 0) {
        details.push(this._armOptions.skip_delay
          ? this._t('sheet.no_exit_delay')
          : this._t('sheet.exit_delay').replace('{n}', String(exit)));
      }
      const open = this._openSensorList().filter(function (x) { return !x.clear; }).length;
      if (mode && mode !== 'disarmed' && this._armOptions.force && open) {
        details.push(tCount(this._lang(), 'sheet.bypassing', open));
      }

      return [
        '<div class="sheet-summary">',
        '<div class="sheet-action">' + esc(action) + '</div>',
        details.length
          ? '<div class="sheet-detail">' + esc(details.join(' · ')) + '</div>' : '',
        '</div>'
      ].join('');
    }

    _modeLabel(state) {
      const block = stateBlock(this._config, state);
      if (block.button_label) return block.button_label;
      return this._t('button.' + state, state);
    }

    /* ---- DOM patch helpers ---- */

    _q(selector) {
      if (this._nodeCache.has(selector)) return this._nodeCache.get(selector);
      const node = this.shadowRoot.querySelector(selector);
      this._nodeCache.set(selector, node);
      return node;
    }

    _setText(selector, text) {
      const node = this._q(selector);
      if (node && node.textContent !== text) node.textContent = text;
    }

    _setAttr(selector, name, value) {
      const node = this._q(selector);
      if (!node) return;
      if (value === null || value === false || value === undefined) {
        if (node.hasAttribute(name)) node.removeAttribute(name);
      } else if (node.getAttribute(name) !== String(value)) {
        node.setAttribute(name, String(value));
      }
    }

    /* style.setProperty invalidates style even when handed the value it
       already holds, so the previous value is remembered rather than read
       back — a countdown would otherwise force a restyle every second. */
    _setVar(selector, name, value) {
      const key = selector + '|' + name;
      if (this._varCache.get(key) === value) return;
      const node = this._q(selector);
      if (!node) return;
      this._varCache.set(key, value);
      node.style.setProperty(name, value);
    }

    _syncTheme() {
      const themes = this._hass ? this._hass.themes : null;
      const key = themes ? themes.theme + '|' + themes.darkMode : '';
      if (key === this._themeKey) return;
      this._themeKey = key;
      this._setAttr(':host', 'data-dark', null);
      if (themes && themes.darkMode) this.setAttribute('data-dark', '');
      else this.removeAttribute('data-dark');
      /* Reading the theme's own tokens through var() is not enough: a theme
         that leaves one empty makes the var() invalid at computed-value time,
         and that does not fall back — the property resets to its initial value
         and the card's corners quietly vanish. So they are read here, the
         browser is asked whether they are usable, and only then applied. */
      const style = getComputedStyle(this);
      const take = function (token, property, fallback) {
        const value = style.getPropertyValue(token).trim();
        const usable = value && typeof CSS !== 'undefined' && CSS.supports
          && CSS.supports(property, value);
        return usable ? value : fallback;
      };
      this.style.setProperty('--amc-card-radius',
        take('--ha-card-border-radius', 'border-radius', '12px'));
    }

    /* ---- paint ---- */

    _paint() {
      const stateObj = this._stateObj();
      if (!stateObj || this._backendOk === false) return;
      const state = stateObj.state;
      const config = this._config;

      this.setAttribute('data-layout', config.layout);
      this.setAttribute('data-state', state);
      this.style.setProperty('--amc-scale-actions', String(config.button_scale_actions));
      this.style.setProperty('--amc-scale-keypad', String(config.button_scale_keypad));

      const block = stateBlock(config, state);
      const rgb = toRgbTriplet(block.color) || stateColorVar(state);
      this.style.setProperty('--amc-state-rgb', rgb);

      /* hero */
      if (config.icon_type !== 'none') {
        const counting = PENDING_STATES.includes(state) && this._deadline > 0;
        this._setVar('#hero-shape', '--amc-shape-color', 'rgba(' + rgb + ',0.2)');
        this._setVar('#hero-shape', '--amc-icon-color', 'rgb(' + rgb + ')');
        this._setVar('#hero-shape', '--amc-shape-animation',
          this._shouldPulse(state) ? '1s ease 0s infinite normal none running amc-pulse' : 'none');
        this._setAttr('#hero-icon', 'icon', this._stateIcon(state));
        this._setAttr('#hero-icon', 'hidden', counting ? '' : null);
        this._setAttr('#countdown', 'hidden', counting ? null : '');
        this._setAttr('#ring', 'hidden', counting ? null : '');

        const sensors = this._sensorIds(stateObj);
        const showBadge = sensors.length > 0 && !this._noticeKind();
        this._setAttr('#hero-badge', 'hidden', showBadge ? null : '');
        this._setVar('#hero-badge', '--amc-badge-color', 'rgb(var(--amc-rgb-warning))');
      }

      /* text */
      this._setText('#primary', this._nameText(stateObj));
      this._setText('#secondary', this._stateText(stateObj));

      /* mode buttons */
      const activeKey = this._activeModeKey(stateObj);
      for (const mode of this._visibleModes()) {
        const selector = '#mode-' + mode.key;
        const isActive = mode.key === activeKey;
        const modeRgb = toRgbTriplet(stateBlock(config, mode.key).color)
          || stateColorVar(mode.key);
        /* Only the active button takes colour; the rest keep the neutral 5%
           tint. Colouring them all turns the row into a paint chart and stops
           the current mode reading as current at a glance. */
        this._setVar(selector, '--amc-bg-color',
          isActive ? 'rgba(' + modeRgb + ',0.2)' : 'rgba(var(--amc-rgb-text),0.05)');
        this._setVar(selector, '--amc-bg-hover',
          isActive ? 'rgba(' + modeRgb + ',0.28)' : 'rgba(var(--amc-rgb-text),0.09)');
        this._setVar(selector, '--amc-icon-color',
          isActive ? 'rgb(' + modeRgb + ')' : 'var(--primary-text-color)');

        const ready = this._modeReady(mode);
        const showDot = config.show_ready_indicator && mode.arms && ready !== null;
        this._setAttr('#ready-' + mode.key, 'hidden', showDot ? null : '');
        if (showDot) {
          this._setVar('#ready-' + mode.key, '--amc-badge-color',
            ready ? 'rgb(var(--amc-rgb-success))' : 'rgb(var(--amc-rgb-warning))');
        }
        /* A mode that is not ready cannot be armed, so the button says so
           instead of accepting the tap and reporting the failure afterwards. */
        const blocked = showDot && !ready && !this._armOptions.force;
        this._setAttr(selector, 'aria-disabled', blocked ? 'true' : null);
        this._setAttr(selector, 'title', blocked
          ? this._t('ready.not_ready') : (mode.label || ''));
      }

      this._syncDensity();
      this._paintNotice();
      this._paintArmOptions();
      this._paintCode();
      this._paintCountdown();

      this._setAttr('#flash', 'hidden', this._flash ? null : '');
      if (this._flash) this._setText('#flash', this._flash);
    }

    /* CSS cannot ask how wide a word is, and the threshold depends on how many
       buttons are sharing the row, so the measuring happens here. 92px is where
       "Vacation" beside its icon starts to clip in the shipped font. */
    _syncDensity() {
      const group = this._q('.button-group');
      if (!group) return;
      const count = group.children.length;
      if (!count) return;
      /* Name-only buttons have nothing left once the label goes. */
      if (this._config.button_content === 'name') {
        group.classList.remove('compact');
        return;
      }
      const width = group.clientWidth;
      if (!width) return;   /* not laid out yet; the observer will call back */
      const gap = 10 * (count - 1);
      group.classList.toggle('compact', (width - gap) / count < 92);
    }

    _paintNotice() {
      const kind = this._noticeKind();
      if (!kind) return;
      const sensors = this._noticeSensors();
      const openCount = kind === 'bypassed'
        ? sensors.length
        : this._openSensorList().filter(function (s) { return !s.clear; }).length;

      const icons = {
        blocked: 'mdi:shield-alert-outline',
        ready: 'mdi:shield-check-outline',
        triggered: 'mdi:bell-ring',
        bypassed: 'mdi:shield-off-outline'
      };
      const titles = {
        blocked: this._t('notice.blocked_title'),
        ready: this._t('notice.blocked_ready'),
        triggered: this._t('notice.triggered_title'),
        bypassed: this._t('notice.bypassed_title')
      };
      this._setAttr('#notice-icon', 'icon', icons[kind]);
      this._setText('#notice-title', titles[kind]);
      /* The count follows the chips out of view when the row scrolls, so it
         reports the true total rather than what happens to be on screen. */
      const count = kind === 'bypassed' ? sensors.length : openCount;
      this._setText('#notice-count', String(count));
      this._setAttr('#notice-count', 'hidden', count > 0 ? null : '');

      sensors.slice(0, this._expanded ? sensors.length : this._config.max_sensor_chips)
        .forEach(function (s, i) {
          const chip = this._q('#chip-' + i);
          if (!chip) return;
          chip.classList.toggle('is-clear', s.clear && !s.missing);
          chip.classList.toggle('is-missing', s.missing);
          chip.setAttribute('title', s.name + ' — ' + s.sub);
          /* Watching the door glyph swap from open to closed is half of the
             "did shutting it work?" feedback, so the icon is patched live
             rather than only at the next shell rebuild. */
          this._setAttr('#chip-icon-' + i, 'icon', s.icon);
        }.bind(this));

      if (this._bypassAvailable()) {
        const retry = kind === 'ready';
        this._setText('#bypass-label',
          this._confirming ? this._t('notice.action_bypass_confirm')
            : this._t(retry ? 'notice.action_retry' : 'notice.action_bypass'));
        this._setAttr('#bypass-icon', 'icon', retry ? 'mdi:shield-check' : 'mdi:shield-off-outline');
        this._setAttr('#bypass', 'data-confirm', this._confirming ? '' : null);
      }
    }

    _paintArmOptions() {
      if (this._q('#opt-force')) {
        this._setAttr('#opt-force', 'data-on', this._armOptions.force ? '' : null);
      }
      if (this._q('#opt-skip')) {
        this._setAttr('#opt-skip', 'data-on', this._armOptions.skip_delay ? '' : null);
      }
    }

    _paintCode() {
      const hint = this._codeError ? this._t('errors.invalid_pin') : '';
      for (const prefix of ['#code', '#sheet']) {
        const dots = this._q(prefix + '-dots');
        if (dots) {
          const want = Math.max(4, this._code.length);
          if (dots.children.length !== want) {
            dots.innerHTML = new Array(want).fill('<span class="code-dot"></span>').join('');
          }
          Array.prototype.forEach.call(dots.children, function (dot, i) {
            if (i < this._code.length) dot.setAttribute('data-filled', '');
            else dot.removeAttribute('data-filled');
          }.bind(this));
          /* Re-adding a class the element already carries does not restart
             its animation, so the second wrong code in a row sat perfectly
             still. Dropping the class and forcing a reflow rewinds it. */
          if (this._codeError) {
            dots.classList.remove('shake');
            void dots.offsetWidth;
            dots.classList.add('shake');
          } else {
            dots.classList.remove('shake');
          }
        }
        const hintNode = this._q(prefix + '-hint');
        if (hintNode) {
          hintNode.textContent = hint;
          if (this._codeError) hintNode.setAttribute('data-error', '');
          else hintNode.removeAttribute('data-error');
        }
      }
    }

    _shouldPulse(state) {
      return ['arming', 'pending', 'triggered', 'unavailable'].includes(state);
    }

    _stateIcon(state) {
      if (state === 'triggered') return 'mdi:bell-ring';
      if (state === 'unavailable' || state === 'unknown') return 'mdi:shield-alert';
      if (state === 'disarmed') return DISARM_ICON;
      const mode = ARM_MODES.find(function (m) { return m.state === state; });
      if (mode) return mode.icon;
      /* arming and pending show a countdown where the glyph would be; this is
         only what sits underneath before the timer arrives. */
      return 'mdi:shield-outline';
    }

    _nameText(stateObj) {
      if (this._config.name !== undefined) return this._config.name;
      return (stateObj.attributes && stateObj.attributes.friendly_name) || this._config.entity;
    }

    _stateText(stateObj) {
      const block = stateBlock(this._config, stateObj.state);
      if (block.state_label !== undefined) return block.state_label;
      /* Home Assistant's own translation wins when it has one, so a house
         running a language this card does not ship still reads correctly.
         Ours is the floor, not the ceiling. */
      const hass = this._hass;
      if (hass && typeof hass.formatEntityState === 'function') {
        try {
          const text = hass.formatEntityState(stateObj);
          if (text) return text;
        } catch (error) { /* older frontends do not have it */ }
      }
      if (hass && typeof hass.localize === 'function') {
        const text = hass.localize(
          'component.alarm_control_panel.entity_component._.state.' + stateObj.state);
        if (text) return text;
      }
      return this._t('state.' + stateObj.state, this._t('state.unknown'));
    }

    _activeModeKey(stateObj) {
      if (stateObj.state === 'disarmed') return 'disarmed';
      /* While arming or counting down, the mode being armed stays highlighted
         rather than nothing being selected — the target is what the user cares
         about during the delay. */
      if (PENDING_STATES.includes(stateObj.state) || stateObj.state === 'triggered') {
        const target = stateObj.attributes && stateObj.attributes.arm_mode;
        if (target) return target;
      }
      return stateObj.state;
    }

    /* true = ready, false = blocked, null = do not know, say nothing.
       Alarmo starts _ready_to_arm_modes as [] and only recomputes it when a
       sensor changes state (sensors.py). A house with no sensors configured
       therefore reports [] forever — the same answer it gives when every mode
       really is blocked. Reading those two alike greyed out every arm button
       in a house that had nothing capable of blocking it, and, because a
       blocked button is not clickable, left no way to arm at all.

       An empty list is treated as "unknown" for that reason: when everything
       genuinely is blocked, letting the tap through costs one failed arm and
       the panel then names the sensors, which is far better than a card that
       cannot arm and will not say why. */
    _modeReady(mode) {
      if (!mode.arms) return null;
      if (!Array.isArray(this._readyModes) || !this._readyModes.length) return null;
      if (!this._sensorCount) return null;
      /* Alarmo reports readiness as full state names — 'armed_away', not
         'away'. Its own debug log strips the prefix, which is an easy way to
         end up matching against the short form and marking every mode
         not-ready. */
      return this._readyModes.includes(mode.key);
    }

    /* ---- countdown ---- */

    _syncDeadline() {
      const stateObj = this._stateObj();
      const counting = stateObj && PENDING_STATES.includes(stateObj.state);
      if (!counting) {
        if (this._deadline) { this._deadline = 0; this._delay = 0; }
        this._stopTick();
        return;
      }
      if (!this._deadline && !this._fetchingCountdown) this._fetchCountdown();
      if (!this._offscreen) this._startTick();
    }

    async _fetchCountdown() {
      if (!this._hass || !this._config) return;
      this._fetchingCountdown = true;
      let delay = 0;
      let remaining = 0;
      try {
        const res = await this._hass.callWS({
          type: WS.countdown, entity_id: this._config.entity
        });
        delay = Number(res && res.delay) || 0;
        remaining = Number(res && res.remaining) || 0;
      } catch (error) {
        /* Older Alarmo, or the command refused. The panel still publishes the
           configured delay, and last_changed is when the countdown started. */
        const attrs = this._attrs();
        delay = Number(attrs.delay) || 0;
        const stateObj = this._stateObj();
        const started = stateObj ? Date.parse(stateObj.last_changed) : NaN;
        remaining = isFinite(started) ? Math.max(0, delay - (Date.now() - started) / 1000) : delay;
      }
      this._fetchingCountdown = false;
      if (!delay && !remaining) return;
      /* An absolute deadline, not a counter that decrements. A backgrounded
         tab throttles setInterval to about once a minute, and a counter comes
         back minutes wrong while the clock never does. */
      this._delay = delay || remaining;
      this._deadline = Date.now() + remaining * 1000;
      this._resetRing();
      this._startTick();
      this._paint();
    }

    /* A second arm attempt moves the deadline forward, and the arc would
       animate backwards through zero to get there. Killing the transition for
       one frame makes the jump instant and the next tick smooth again. */
    _resetRing() {
      const arc = this._q('#ring-arc');
      if (!arc) return;
      arc.style.transition = 'none';
      this._varCache.delete('#ring-arc|--amc-ring-dash');
      arc.style.setProperty('--amc-ring-dash', RING_CIRCUMFERENCE + ' ' + RING_CIRCUMFERENCE);
      void arc.offsetWidth;
      arc.style.transition = '';
    }

    _startTick() {
      if (this._tickTimer) return;
      this._tickTimer = setInterval(this._paintCountdown.bind(this), 1000);
    }

    _stopTick() {
      if (!this._tickTimer) return;
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }

    _paintCountdown() {
      if (!this._deadline) return;
      const remaining = Math.max(0, (this._deadline - Date.now()) / 1000);
      const fraction = this._delay > 0 ? Math.min(1, remaining / this._delay) : 0;
      this._setVar('#ring-arc', '--amc-ring-dash',
        (fraction * RING_CIRCUMFERENCE).toFixed(2) + ' ' + RING_CIRCUMFERENCE);
      const seconds = Math.ceil(remaining);
      this._setText('#countdown-digits', seconds >= 60
        ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
        : String(seconds));
      if (remaining <= 0) this._stopTick();
    }

    /* ---- actions ---- */

    _callArm(mode, code, extra) {
      if (!this._hass || !this._config) return;
      const payload = Object.assign({
        entity_id: this._config.entity,
        mode: mode,
        skip_delay: this._armOptions.skip_delay,
        force: this._armOptions.force
      }, extra || {});
      if (code) payload.code = code;
      this._hass.callService(DOMAIN, SERVICE.arm, payload);
    }

    _handleMode(key) {
      const code = this._code;
      if (key === 'disarmed') {
        const payload = { entity_id: this._config.entity };
        if (code) payload.code = code;
        this._hass.callService(DOMAIN, SERVICE.disarm, payload);
      } else {
        /* Tapping a mode is a fresh intent, so any panel left over from a
           previous failure stops being the thing the bypass button retries. */
        this._clearPending();
        this._callArm(key, code);
      }
      this._code = '';
      this._codeError = false;
      this._armReset();
      this._render();
    }

    _armReset() {
      /* The arm options are per-attempt, like upstream's kebab toggles: they
         describe this arm, not a preference. */
      this._armOptions = { force: false, skip_delay: false };
    }

    _bypass() {
      if (!this._pending || !this._pending.mode) return;
      const retry = this._noticeKind() === 'ready';
      /* Nothing is being bypassed when everything has closed again, so the
         confirm step is skipped and force is not sent — a plain arm. */
      if (this._config.confirm_bypass && !retry && !this._confirming) {
        this._confirming = true;
        clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(function () {
          this._confirming = false;
          this._paint();
        }.bind(this), CONFIRM_MS);
        this._paint();
        return;
      }
      clearTimeout(this._confirmTimer);
      this._confirming = false;
      const mode = this._pending.mode;
      const code = this._pending.code;
      this._callArm(mode, code, retry ? { force: false } : { force: true });
      /* _pending is deliberately kept until the backend confirms: upstream
         cleared it here, so a second failure left the button a no-op until a
         fresh event happened to arrive. */
      this._render();
    }

    _clearPending() {
      this._pending = null;
      this._confirming = false;
      clearTimeout(this._confirmTimer);
      this._confirmTimer = null;
      this._expanded = false;
    }

    _skipDelay() {
      if (!this._hass || !this._config) return;
      this._hass.callService(DOMAIN, SERVICE.skipDelay, { entity_id: this._config.entity });
    }

    _flashMessage(text, isCodeError) {
      this._flash = text;
      this._codeError = !!isCodeError;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(function () {
        this._flash = '';
        this._codeError = false;
        this._render();
      }.bind(this), FLASH_MS);
    }

    _clearCode() {
      this._code = '';
      this._codeError = false;
      clearTimeout(this._codeTimer);
      this._codeTimer = null;
    }

    _touchCode() {
      clearTimeout(this._codeTimer);
      /* A code left half-typed on a wall tablet is a code sitting in the open.
         Two minutes of no keys and it goes away by itself. */
      this._codeTimer = setTimeout(function () {
        this._code = '';
        this._render();
      }.bind(this), CODE_IDLE_MS);
    }

    /* ---- interaction ---- */

    _onClick(ev) {
      /* composedPath, not ev.target: a tap landing on the <ha-icon> inside a
         button reports that element's own shadow content as the target, and
         closest() from there never crosses back out to the button. */
      const path = ev.composedPath ? ev.composedPath() : [ev.target];
      let node = null;
      for (const candidate of path) {
        if (candidate && candidate.dataset && candidate.dataset.act) { node = candidate; break; }
        if (candidate === this.shadowRoot) break;
      }
      if (!node) return;
      const act = node.dataset.act;

      switch (act) {
        case 'hero': {
          const stateObj = this._stateObj();
          if (stateObj && PENDING_STATES.includes(stateObj.state) && this._deadline) {
            this._skipDelay();
          } else {
            fireEvent(this, 'hass-more-info', { entityId: this._config.entity });
          }
          break;
        }
        case 'mode':
          if (this._config.use_code_dialog && this._codeRequired()) {
            this._sheetMode = node.dataset.mode;
            this._sheetOpen = true;
            this._clearCode();
            this._render();
          } else {
            this._handleMode(node.dataset.mode);
          }
          break;
        case 'opt': {
          const opt = node.dataset.opt;
          this._armOptions[opt] = !this._armOptions[opt];
          this._paintArmOptions();
          this._paint();
          break;
        }
        case 'bypass':
          this._bypass();
          break;
        case 'expand':
          this._expanded = true;
          this._render();
          break;
        case 'sensor':
          fireEvent(this, 'hass-more-info', { entityId: node.dataset.entity });
          break;
        case 'key':
          this._handleKey(node.dataset.key);
          break;
        case 'submit':
          this._submitSheet();
          break;
        case 'sheet-backdrop':
          if (node === (ev.composedPath ? ev.composedPath()[0] : ev.target)) this._closeSheet();
          break;
        default:
          break;
      }
    }

    _handleKey(key) {
      if (key === 'back') this._code = this._code.slice(0, -1);
      else if (this._code.length < 12) this._code += key;
      this._codeError = false;
      this._touchCode();
      this._paintCode();
    }

    _onKeydown(ev) {
      if (!this._codeVisible() && !this._sheetOpen) return;
      if (/^\d$/.test(ev.key)) { this._handleKey(ev.key); return; }
      if (ev.key === 'Backspace') { this._handleKey('back'); return; }
      if (ev.key === 'Escape' && this._sheetOpen) { this._closeSheet(); return; }
      if (ev.key === 'Enter' && this._sheetOpen) this._submitSheet();
    }

    _onVisibility() {
      /* Coming back from a background tab, the clock is the truth; the ring
         is repainted from the deadline rather than resumed from where the
         throttled interval left it. */
      if (typeof document !== 'undefined' && document.hidden) { this._stopTick(); return; }
      this._syncDeadline();
      this._paintCountdown();
    }

    /* The sheet stays up until the backend answers. Closing it on submit put
       the "wrong code" message on the card *behind* the sheet, where the
       person who had just typed the code was not looking — from the front it
       looked like nothing happened at all. It is closed from the arm/disarm
       event instead, once the code is known to have been accepted. */
    _submitSheet() {
      const mode = this._sheetMode;
      if (!mode) { this._closeSheet(); return; }
      this._handleMode(mode);
    }

    _closeSheet() {
      this._sheetOpen = false;
      this._sheetMode = null;
      this._clearCode();
      this._render();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 9 · The visual editor                                               */
  /* ------------------------------------------------------------------ */

  /* ha-form is flat and the config is nested, so per-state keys travel as
     "<state>__<field>". A double underscore is safe: every state name uses
     single ones. */
  const SEP = '__';

  class AlarmoMushroomCardEditor extends HTMLElement {
    constructor() {
      super();
      this._config = null;
      this._hass = null;
      this._form = null;
      this._alarmoIds = null;
    }

    setConfig(config) {
      this._config = Object.assign({}, DEFAULTS, config || {});
      this._update();
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      if (first) this._loadEntities();
      /* set hass fires on every state change in the house. Handing ha-form a
         freshly built schema array each time makes it re-render the whole
         form, which loses a half-typed field and closes the section being
         edited. Only rebuild when something the form is actually made of has
         changed. */
      this._update();
    }

    async _loadEntities() {
      if (!this._hass) return;
      try {
        const entries = await this._hass.callWS({ type: WS.entities });
        this._alarmoIds = (entries || []).map(function (e) { return e.entity_id; });
      } catch (error) {
        /* Without Alarmo answering, offering every alarm panel is better than
           offering none — the card will say what is wrong once it is placed. */
        this._alarmoIds = null;
      }
      this._update();
    }

    _lang() {
      return resolveLanguage(this._config ? this._config.language : 'auto', this._hass);
    }

    _t(key, fallback) {
      return tLang(this._lang(), 'editor.' + key, fallback);
    }

    _stateObj() {
      if (!this._hass || !this._config || !this._config.entity) return null;
      return this._hass.states[this._config.entity] || null;
    }

    /* The states this panel can actually reach, plus the three transient ones
       upstream's editor could not present at all. */
    _editableStates() {
      const stateObj = this._stateObj();
      const modes = stateObj ? supportedArmModes(stateObj) : ARM_MODES;
      return ['disarmed']
        .concat(modes.map(function (m) { return m.state; }))
        .concat(TRANSIENT_STATES);
    }

    _stateLabel(state) {
      return tLang(this._lang(), 'state.' + state, state);
    }

    /* Every section here is deliberately unnamed. ha-form reads a section's
       value as `data[schema.name]` and emits it back as
       `{[schema.name]: value}` unless the name is empty — so a named
       "keypad" section would hand this editor {keypad: {hide_keypad: true}},
       the flat lookup would miss it, and Home Assistant would re-apply the old
       config a moment later. On screen that reads as a switch that flips back
       by itself. The title carries the heading instead of the name. */
    _schema() {
      const entitySelector = { domain: 'alarm_control_panel' };
      if (this._alarmoIds && this._alarmoIds.length) {
        entitySelector.include_entities = this._alarmoIds;
      }
      const langOptions = LANGUAGE_OPTIONS.map(function (o) {
        return { value: o.value, label: tLang(this._lang(), o.labelKey, o.value) };
      }.bind(this));

      return [
        { name: 'entity', required: true, selector: { entity: entitySelector } },
        { name: '', type: 'grid', schema: [
          { name: 'name', selector: { text: {} } },
          { name: 'language', selector: { select: { mode: 'dropdown', options: langOptions } } }
        ] },
        { name: '', type: 'expandable', icon: 'mdi:palette', title: this._t('appearance'), schema: [
          { name: '', type: 'grid', schema: [
            { name: 'layout', selector: { select: { mode: 'dropdown', options: [
              { value: 'default', label: this._t('layout_default') },
              { value: 'horizontal', label: this._t('layout_horizontal') },
              { value: 'vertical', label: this._t('layout_vertical') }
            ] } } },
            { name: 'icon_type', selector: { select: { mode: 'dropdown', options: [
              { value: 'icon', label: this._t('icon_type_icon') },
              { value: 'none', label: this._t('icon_type_none') }
            ] } } }
          ] },
          { name: 'fill_container', selector: { boolean: {} } }
        ] },
        { name: '', type: 'expandable', icon: 'mdi:gesture-tap-button', title: this._t('buttons'), schema: [
          { name: 'button_content', selector: { select: { mode: 'dropdown', options: [
            { value: 'icon_and_name', label: this._t('button_content_both') },
            { value: 'icon', label: this._t('button_content_icon') },
            { value: 'name', label: this._t('button_content_name') }
          ] } } },
          { name: 'button_scale_actions', selector: {
            number: { min: MIN_SCALE, max: MAX_SCALE, step: 0.1, mode: 'slider' } } },
          { name: 'show_ready_indicator', selector: { boolean: {} } },
          { name: 'show_force_option', selector: { boolean: {} } },
          { name: 'show_skip_delay_option', selector: { boolean: {} } }
        ] },
        { name: '', type: 'expandable', icon: 'mdi:dialpad', title: this._t('keypad'), schema: [
          { name: 'hide_keypad', selector: { boolean: {} } },
          { name: 'keep_keypad_visible', selector: { boolean: {} } },
          { name: 'use_code_dialog', selector: { boolean: {} } },
          { name: 'button_scale_keypad', selector: {
            number: { min: MIN_SCALE, max: MAX_SCALE, step: 0.1, mode: 'slider' } } }
        ] },
        { name: '', type: 'expandable', icon: 'mdi:door-open', title: this._t('notices'), schema: [
          { name: 'show_messages', selector: { boolean: {} } },
          { name: 'show_bypass_button', selector: { boolean: {} } },
          { name: 'confirm_bypass', selector: { boolean: {} } },
          { name: 'show_bypassed_sensors', selector: { boolean: {} } },
          { name: 'max_sensor_chips', selector: {
            number: { min: 1, max: 30, step: 1, mode: 'box' } } }
        ] }
      ].concat(this._stateSections());
    }

    _stateSections() {
      return this._editableStates().map(function (state) {
        const transient = TRANSIENT_STATES.includes(state);
        const fields = [
          { name: '', type: 'grid', schema: [
            { name: state + SEP + 'state_label', selector: { text: {} } },
            { name: state + SEP + 'color', selector: { ui_color: {} } }
          ] }
        ];
        if (!transient) {
          fields.push({ name: '', type: 'grid', schema: [
            { name: state + SEP + 'button_label', selector: { text: {} } },
            { name: state + SEP + 'button_icon', selector: { icon: {} } }
          ] });
          fields.push({ name: state + SEP + 'hide', selector: { select: { mode: 'dropdown', options: [
            /* Upstream's radio labelled these by when the button is SHOWN
               while storing when it is HIDDEN, with the two swapped against
               each other. The stored values are unchanged here; only the
               wording is made to match what gets saved. */
            { value: 'never', label: this._t('hide_never') },
            { value: 'always', label: this._t('hide_always') },
            { value: 'disarmed', label: this._t('hide_disarmed') },
            { value: 'armed', label: this._t('hide_armed') }
          ] } } });
          fields.push({ name: state + SEP + 'button_order', selector: {
            number: { min: 0, max: 20, step: 1, mode: 'box' } } });
        }
        return {
          name: '',
          type: 'expandable',
          icon: state === 'disarmed' ? DISARM_ICON : this._stateIconFor(state),
          title: this._t('section_state').replace('{state}', this._stateLabel(state)),
          schema: fields
        };
      }.bind(this));
    }

    _stateIconFor(state) {
      const mode = ARM_MODES.find(function (m) { return m.state === state; });
      if (mode) return mode.icon;
      if (state === 'triggered') return 'mdi:bell-ring';
      return 'mdi:shield-outline';
    }

    _formData() {
      const config = this._config || {};
      const data = {};
      for (const key of Object.keys(DEFAULTS)) {
        if (key === 'states') continue;
        if (config[key] !== undefined) data[key] = config[key];
      }
      const states = config.states || {};
      for (const state of Object.keys(states)) {
        const block = states[state] || {};
        for (const field of Object.keys(block)) {
          if (block[field] !== undefined) data[state + SEP + field] = block[field];
        }
      }
      return data;
    }

    _update() {
      if (!this._config) return;
      if (!this._form) {
        this.innerHTML = '';
        this._form = document.createElement('ha-form');
        this._form.addEventListener('value-changed', this._valueChanged.bind(this));
        this.appendChild(this._form);
        this._form.computeLabel = this._computeLabel.bind(this);
        this._form.computeHelper = this._computeHelper.bind(this);
      }
      this._form.hass = this._hass;

      const data = this._formData();
      const dataSig = JSON.stringify(data);
      if (dataSig !== this._dataSig) {
        this._dataSig = dataSig;
        this._form.data = data;
      }

      /* The schema only depends on these; the entity decides which arm modes
         get a section, and the language decides every label. */
      const stateObj = this._stateObj();
      const schemaSig = [
        this._lang(),
        this._config.entity,
        stateObj ? stateObj.attributes.supported_features : '',
        this._alarmoIds ? this._alarmoIds.join(',') : ''
      ].join('|');
      if (schemaSig !== this._schemaSig) {
        this._schemaSig = schemaSig;
        this._form.schema = this._schema();
      }
    }

    _computeLabel(schema) {
      const name = String(schema.name || '');
      if (name.includes(SEP)) return this._t(name.split(SEP)[1], name);
      return this._t(name, name);
    }

    /* Upstream greyed out controls behind five chained conditions and never
       said why. Here nothing is disabled — the reason is simply written down,
       so a setting that will not bite yet still explains itself. */
    _computeHelper(schema) {
      const name = String(schema.name || '');
      const helpKey = name + '_help';
      const help = tLang(this._lang(), 'editor.' + helpKey, '');
      return help === 'editor.' + helpKey ? undefined : help;
    }

    _valueChanged(ev) {
      ev.stopPropagation();
      const value = Object.assign({}, ev.detail.value);
      const config = { type: (this._config && this._config.type) || ('custom:' + CARD_TYPE) };

      for (const key of Object.keys(DEFAULTS)) {
        if (key === 'states') continue;
        const next = value[key];
        /* Only what differs from the default is written. A config full of
           keys restating the defaults makes the YAML unreadable and makes a
           future change of default impossible to roll out. */
        if (next === undefined || next === '' || next === null) continue;
        if (next === DEFAULTS[key]) continue;
        config[key] = next;
      }
      /* An explicit empty name means "draw no name", which is not the default
         and has to survive the pruning above. */
      if (value.name === '' && this._config && this._config.name === '') config.name = '';

      const states = {};
      for (const key of Object.keys(value)) {
        if (!key.includes(SEP)) continue;
        const parts = key.split(SEP);
        const state = parts[0];
        const field = parts[1];
        const next = value[key];
        if (next === undefined || next === null || next === '') continue;
        if (field === 'hide' && next === 'never') continue;
        states[state] = states[state] || {};
        states[state][field] = field === 'button_order' ? Number(next) : next;
      }
      /* Preserve any key this editor does not know about, so a config written
         by hand or by a newer version round-trips instead of being erased. */
      for (const key of Object.keys(this._config || {})) {
        if (key === 'type' || key === 'states') continue;
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
        if (key === 'button_scale') continue;   /* migrated, never written back */
        config[key] = this._config[key];
      }
      if (Object.keys(states).length) config.states = states;

      this._config = Object.assign({}, DEFAULTS, config);
      fireEvent(this, 'config-changed', { config: config });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 10 · Registration                                                   */
  /* ------------------------------------------------------------------ */

  /* Loaded twice — an old hand-added Lovelace resource alongside a HACS one —
     the second define would throw and take the whole module down with it. */
  if (!customElements.get(CARD_TYPE)) {
    customElements.define(CARD_TYPE, AlarmoMushroomCard);
  }
  if (!customElements.get(EDITOR_TYPE)) {
    customElements.define(EDITOR_TYPE, AlarmoMushroomCardEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.find(function (c) { return c.type === CARD_TYPE; })) {
    window.customCards.push({
      type: CARD_TYPE,
      name: 'Alarmo Mushroom Card',
      description: 'Alarmo alarm panel in the Mushroom design language, with a readable open-sensor panel.',
      documentationURL: DOCS_URL,
      /* Tells the picker this card can draw itself from the stub config, so
         the tile shows the real card instead of a text row. */
      preview: true
    });
  }

  console.info(
    '%c ALARMO-MUSHROOM-CARD %c ' + CARD_VERSION + ' ',
    'color:white;background:#4caf50;font-weight:700',
    'color:#4caf50;background:transparent;font-weight:700'
  );
})();
