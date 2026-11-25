import { Screen, Txt } from '@/components/ui';

// Utkast. Fyll inn behandlingsansvarlig og kontaktadresse før lansering.
const SECTIONS: [string, string][] = [
  [
    'Hvem er behandlingsansvarlig?',
    'Heimvis drives av [navn / organisasjon]. Kontakt: [e-post]. Spørsmål om personvern kan rettes hit.',
  ],
  [
    'Hvilke opplysninger lagrer vi?',
    'E-postadresse (for innlogging), visningsnavn, eventuelt profilbilde, og innholdet du selv legger inn i husstanden: oppslag, kommentarer, stemmer, handlelister, hendelser og oppgaver. Vi lagrer ikke passord, posisjon, kontakter eller annen informasjon fra telefonen.',
  ],
  [
    'Hvorfor?',
    'Opplysningene brukes kun for å levere tjenesten til deg og husstanden din (GDPR art. 6 nr. 1 b). Vi selger ikke data, viser ikke reklame og bruker ikke sporingsverktøy.',
  ],
  [
    'Hvem ser dataene?',
    'Kun aktive medlemmer av husstanden din ser innholdet i husstanden. I anonyme avstemninger ser ingen andre hva du har stemt. Tilgangen håndheves i databasen, ikke bare i appen.',
  ],
  [
    'Hvor lagres dataene?',
    'Hos Supabase i et datasenter i EU/EØS. All trafikk er kryptert (TLS), og innloggingsøkten er kryptert på telefonen din.',
  ],
  [
    'Hvor lenge?',
    'Til du sletter kontoen. Avkryssede handlevarer og fullførte oppgaver slettes automatisk etter 12 måneder, logger etter 24 måneder.',
  ],
  [
    'Dine rettigheter',
    'Du kan når som helst laste ned dataene dine og slette kontoen under Innstillinger → Personvern. Du kan også klage til Datatilsynet (datatilsynet.no).',
  ],
];

export default function Privacy() {
  return (
    <Screen edges={['bottom']}>
      <Txt variant="title">Personvernerklæring</Txt>
      {SECTIONS.map(([h, b]) => (
        <Txt key={h}>
          <Txt variant="heading">{`${h}\n`}</Txt>
          {b}
        </Txt>
      ))}
    </Screen>
  );
}
