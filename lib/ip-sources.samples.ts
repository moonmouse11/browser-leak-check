// Real response bodies recorded from each registry service on 2026-09-29,
// with the address and ASN swapped for documentation values (RFC 5737 /
// RFC 5398). Every HTTP source in lib/config.ts must have one here - the
// parser tests fail otherwise, so a new service can't be added unpinned.

export const SAMPLE_IP = '198.51.100.7';
export const SAMPLE_ASN = 'AS64500';

export const RESPONSE_SAMPLES: Record<string, string> = {
  ipify: '{"ip":"198.51.100.7"}',
  'ipify-64': '{"ip":"198.51.100.7"}',
  icanhazip: '198.51.100.7\n',
  'cloudflare-trace':
    'fl=929f26\nh=www.cloudflare.com\nip=198.51.100.7\nts=1790671419.000\nvisit_scheme=https\nuag=Mozilla/5.0\ncolo=FRA\nsliver=none\nhttp=http/2\nloc=DE\ntls=TLSv1.3\nsni=plaintext\nwarp=off\ngateway=off\nrbi=off\nkex=X25519MLKEM768\n',
  'cloudflare-1111':
    'fl=932f2\nh=1.1.1.1\nip=198.51.100.7\nts=1790671419.000\nvisit_scheme=https\nuag=Mozilla/5.0\ncolo=FRA\nsliver=none\nhttp=http/2\nloc=DE\ntls=TLSv1.3\nsni=off\nwarp=off\ngateway=off\nrbi=off\nkex=X25519MLKEM768\n',
  'ident-me':
    '{"ip":"198.51.100.7","aso":"EXAMPLE NET LIMITED","asn":64500,"type":"business","continent":"EU","cc":"DE","country":"Germany","city":"Frankfurt am Main","postal":"60313","latitude":50.1109,"longitude":8.68213,"tz":"Europe/Berlin"}',
  ipinfo:
    '{\n  "ip": "198.51.100.7",\n  "city": "Frankfurt am Main",\n  "region": "Hesse",\n  "country": "DE",\n  "loc": "50.1155,8.6842",\n  "org": "AS64500 Example Net GmbH",\n  "postal": "60306",\n  "timezone": "Europe/Berlin",\n  "readme": "https://ipinfo.io/missingauth"\n}',
  'ifconfig-me':
    '{"ip_addr":"198.51.100.7","user_agent":"Mozilla/5.0","port":"47178","method":"GET","mime":"*/*","via":"1.1 google","forwarded":"198.51.100.7,192.0.2.10"}',
  seeip: '{"ip":"198.51.100.7"}',
  'ipwho-is':
    '{"ip":"198.51.100.7","success":true,"type":"IPv4","continent":"Europe","country":"Germany","country_code":"DE","city":"Frankfurt am Main","connection":{"asn":64500,"org":"examplecorp","isp":"Example Net GmbH","domain":"example.net"}}',
  geojs:
    '{"accuracy":20,"area_code":"0","asn":64500,"city":"Paris","continent_code":"EU","country":"France","country_code":"FR","ip":"198.51.100.7","latitude":"48.8558","longitude":"2.3494","organization":"AS64500 Example Net GmbH","organization_name":"Example Net GmbH","region":"Île-de-France","timezone":"Europe\\/Paris"}',
  bigdatacloud: '{\n  "ipString": "198.51.100.7",\n  "ipType": "IPv4"\n}',
  'aws-checkip': '198.51.100.7\n',
  wtfismyip:
    '{\n  "YourFuckingIPAddress": "198.51.100.7",\n  "YourFuckingLocation": "Paris, IDF, France",\n  "YourFuckingHostname": "198.51.100.7",\n  "YourFuckingISP": "Example Net GmbH",\n  "YourFuckingTorExit": false,\n  "YourFuckingCity": "Paris",\n  "YourFuckingCountry": "France",\n  "YourFuckingCountryCode": "FR"\n}',
  'ip-guide':
    '{\n  "ip": "198.51.100.7",\n  "network": {\n    "cidr": "198.51.100.0/24",\n    "hosts": { "start": "198.51.100.1", "end": "198.51.100.254" },\n    "autonomous_system": {\n      "asn": 64500,\n      "name": "AS64500 Example Net GmbH",\n      "organization": "Example Net GmbH",\n      "country": "DE",\n      "rir": "RIPE NCC"\n    }\n  },\n  "location": { "city": "Paris", "country": "France" }\n}',
  'country-is': '{"ip":"198.51.100.7","country":"DE"}',
  'ipapi-is':
    '{"ip":"198.51.100.7","is_bogon":false,"company":"FKT4","asn":"AS64500 Example Net GmbH","city":"Amsterdam","region":"North Holland","country":"The Netherlands"}',
};
