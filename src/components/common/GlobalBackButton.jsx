import React, { useState, useEffect } from 'react';
import BackButton from './BackButton';
import { getCurrentBackInfo, subscribeBack, triggerBack } from '../../utils/navigation';

// Der runde Zurück-Knopf unten links. Er erscheint, sobald eine Unteransicht (zum Beispiel eine
// Modrinth-Detailseite oder ein Dialog) sich im Zurück-Stack angemeldet hat, und schließt sie zuerst.
export default function GlobalBackButton() {
  const [info, setInfo] = useState(() => getCurrentBackInfo());

  useEffect(() => subscribeBack(() => setInfo(getCurrentBackInfo())), []);

  if (!info) return null;
  return <BackButton label={info.label} onClick={triggerBack} />;
}
