# DPIA není potřeba — zdůvodnění (položka 20)

Datum: 2026-08-16.

Posouzení vlivu podle čl. 35 GDPR se nevyžaduje, protože zpracování
nenaplňuje žádné z kritérií „vysokého rizika":

- **Žádné velké měřítko.** Uzavřený okruh desítek osob (party přátel a
  rodin), jeden správce, žádný nábor veřejnosti.
- **Žádné systematické monitorování.** Statistiky jsou anonymní, bez
  profilování; measurement je vypnutý v administraci i na náhledech.
- **Žádné zvláštní kategorie záměrně.** Podmínky užití zakazují nahrávat
  účtenky se zdravotními položkami; přístup k účtenkám je jen pro
  přihlášené a mažou se 12 měsíců po vyúčtování. Zbytkové riziko (někdo
  přesto nahraje lékárenskou účtenku) je přijato a hlídá se: pokud se to
  začne dít v praxi, toto posouzení se otevře znovu.
- **Žádné automatizované rozhodování s právními účinky.** Vyrovnání je
  prostá aritmetika nad zadanými podíly, stejná pravidla pro všechny.
- **Děti** jsou evidovány jen jako účastníci (jméno, postel, podíl),
  zapisuje je rodič nebo správce se souhlasem rodiče, účty mít nesmí.

2026-10-13: přezkoumáno s nákupním seznamem a propojením s Rohlíkem.
Kritéria se nemění: k Rohlíku jde jen hledaný text a seznam produktů do
košíku pokladníka, který propojení sám zapne; žádné monitorování ani AI na
naší straně (MCP server Rohlíku voláme jako obyčejné API).

2026-11-14: přezkoumáno s konektorem Claude. Kritéria se nemění: služba
sama žádnou AI nespouští ani neprovozuje; uživatel si k vlastnímu účtu
připojí svého asistenta, který vidí a smí jen to, co uživatel na webu
(stejné API, stejné kontroly), a nic nerozhoduje automaticky. Nejde o
monitorování ani o nový okruh subjektů. Riziko, že uživatel pošle
Anthropicu údaje ostatních, které vidí, je stejné jako u kopírování z
webu; zásady na něj upozorňují (kap. 6 a 15) a souhlasová stránka také.

Revize: při přidání AI funkce (čtení účtenek — viz zásady kap. 15, „add
AI = reopen the legal documents first"), při otevření služby veřejnosti
nebo při opakovaném výskytu citlivých dat na účtenkách.
