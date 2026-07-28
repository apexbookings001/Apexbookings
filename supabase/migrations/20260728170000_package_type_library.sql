update public.packages
set name = 'Regular', updated_at = now()
where lower(name) = 'general admission'
  and deleted_at is null;

update public.events event
set studio = jsonb_set(
  event.studio,
  '{bookingPage,packages}',
  (
    select jsonb_agg(
      case
        when lower(package_item.value ->> 'name') = 'general admission' then
          package_item.value || jsonb_build_object(
            'name', 'Regular',
            'icon', '🎫',
            'badge', 'Great Value',
            'accent', '#64748B',
            'glow', 'rgba(100,116,139,0.2)'
          )
        else package_item.value
      end
      order by package_item.ordinality
    )
    from jsonb_array_elements(event.studio #> '{bookingPage,packages}') with ordinality as package_item(value, ordinality)
  ),
  false
), updated_at = now()
where jsonb_typeof(event.studio #> '{bookingPage,packages}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(event.studio #> '{bookingPage,packages}') package_item
    where lower(package_item ->> 'name') = 'general admission'
  );

update public.settings setting
set ticket_template = jsonb_set(
  setting.ticket_template,
  '{bookingPage,packages}',
  (
    select jsonb_agg(
      case
        when lower(package_item.value ->> 'name') = 'general admission' then
          package_item.value || jsonb_build_object(
            'name', 'Regular',
            'icon', '🎫',
            'badge', 'Great Value',
            'accent', '#64748B',
            'glow', 'rgba(100,116,139,0.2)'
          )
        else package_item.value
      end
      order by package_item.ordinality
    )
    from jsonb_array_elements(setting.ticket_template #> '{bookingPage,packages}') with ordinality as package_item(value, ordinality)
  ),
  false
), updated_at = now()
where jsonb_typeof(setting.ticket_template #> '{bookingPage,packages}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(setting.ticket_template #> '{bookingPage,packages}') package_item
    where lower(package_item ->> 'name') = 'general admission'
  );
