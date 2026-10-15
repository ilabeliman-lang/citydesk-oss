alter table businesses add column if not exists declared boolean not null default false;
alter table businesses add column if not exists pin_source text not null default 'stood_here';
alter table businesses add column if not exists google_place_id text;
alter table businesses add column if not exists listing text not null default 'self_listed';
