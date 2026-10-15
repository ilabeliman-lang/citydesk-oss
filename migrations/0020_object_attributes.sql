-- NDU-UPG inspect (#04): physical attributes of a user's OWN recorded items. Private by default; devnet.
-- Enums and numbers only. Labels, receipts, serials and prices stay in 0010 (encrypted).
-- Numbered 0019 because 0017_units / 0018_dispatch are in flight on other branches.
-- Rollback (operator only): drop table if exists property_item_attributes;
create table if not exists property_item_attributes (
  item_id text primary key references property_items (id) on delete cascade,
  user_id text not null,
  category text check (category is null or category in ('bed','chair','sofa','table','storage','refrigerator','oven','stove',
    'dishwasher','washer_dryer','sink','toilet','bathtub','television','fireplace','stairs','lamp','appliance','electronics',
    'generator','water_tank','motorbike','other')),
  material text check (material is null or material ~ '^[a-z_]{2,32}$'),
  dim_x_m double precision check (dim_x_m is null or (dim_x_m > 0 and dim_x_m < 50)),
  dim_y_m double precision check (dim_y_m is null or (dim_y_m > 0 and dim_y_m < 50)),
  dim_z_m double precision check (dim_z_m is null or (dim_z_m > 0 and dim_z_m < 50)),
  mass_kg double precision check (mass_kg is null or (mass_kg > 0 and mass_kg < 100000)),
  mass_source text check (mass_source is null or mass_source in ('owner','estimated','scan')),
  pin_source text check (pin_source is null or pin_source in ('picker','raycast')),
  updated_at timestamptz not null default now()
);
create index if not exists property_item_attributes_user on property_item_attributes (user_id);
