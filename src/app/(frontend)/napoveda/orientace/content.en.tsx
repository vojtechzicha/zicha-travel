// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI), idiomatic English.

import { BedDouble, Car, Compass, Info, Users } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function OrientaceContentEn() {
  return (
    <HelpShell
      title="Finding your way around"
      lead="From picking a chata through the tabs to rooms and cars. The pictures come from a demo chata; yours will look the same."
    >
      <div className="flex flex-col gap-6">
        <Section title="Picking a chata" icon={<Compass size={20} />}>
          <p>
            If your link points to the main address, a list of chatas greets you. The ones
            happening right now run at the top, upcoming ones below them, and the archive last.
          </p>
          <p className="text-sm text-gray-500">
            The screenshots in this guide show the interface in Czech; the layout is the same in
            English.
          </p>
          <Screenshot
            name="vyber-chaty"
            caption="A chata card: name, location, dates and participant avatars. Signed-in users also see their own balance."
          />
          <List
            items={[
              <>
                An upcoming chata shows a countdown in days; one in progress shows how long you are
                staying instead.
              </>,
              <>
                Signed-in users get the list trimmed to their own chatas. An anonymous visitor sees
                all of them.
              </>,
              <>
                Tapping a card takes you inside. The &quot;Switch chata&quot; button in the header
                leads back.
              </>,
            ]}
          />
          <Callout>
            A chata can have its own address, say <code>lipno.zicha.travel</code>. It then opens
            directly and the &quot;Switch chata&quot; button disappears. Other chatas are not
            reachable through such an address.
          </Callout>
        </Section>

        <Section title="Header and tabs" icon={<Info size={20} />}>
          <p>
            Under the chata name you find the location and the name of the banker, the person
            holding the shared kitty. Below them sit the tabs. How many you see depends on what
            the chata admin filled in: empty parts are hidden, and Finances is always there.
          </p>
          <List
            items={[
              <>
                <strong>Information</strong> appears once the chata has a travel description.
              </>,
              <>
                <strong>Organization</strong> appears once rooms or shared cars are entered.
              </>,
              <>
                <strong>Participants</strong> appears as soon as more than two people are coming.
              </>,
              <>
                <strong>Finances</strong> is always here. It has its own help page.
              </>,
            ]}
          />
          <p>
            Switching tabs changes the address in your browser, so a particular view can be shared
            as a link. The browser back button works as usual.
          </p>
        </Section>

        <Section title="Travel information" icon={<Info size={20} />}>
          <Screenshot
            name="informace"
            caption="Arrival and departure, with the day of the week and the length of the stay."
          />
          <p>Below the dates you will find, depending on what is filled in:</p>
          <List
            items={[
              <>A description of the place, links to the accommodation website and a photo gallery.</>,
              <>Practical notes, such as where to pick up the keys or how the Wi-Fi works.</>,
              <>The drive: from where, how long, how many kilometres and where to park.</>,
              <>
                Train and bus connections. Tapping a connection unfolds the individual legs with
                times and train numbers.
              </>,
            ]}
          />
          <Callout>
            Every connection has a button that adds the journey to your Google calendar, transfers
            described and all. A pre-filled event opens; you just save it.
          </Callout>
        </Section>

        <Section title="Rooms and beds" icon={<BedDouble size={20} />}>
          <Screenshot
            name="organizace"
            caption="Each room shows how many of its beds are taken."
          />
          <Steps
            items={[
              <>
                Tap <strong>Show beds</strong> and the room unfolds.
              </>,
              <>
                Each bed carries the name of the person sleeping in it. Empty beds are marked as
                free.
              </>,
              <>
                If someone is not staying the whole time, the nights they are there are listed. On
                the other nights the bed stays free.
              </>,
            ]}
          />
        </Section>

        <Section title="Shared cars" icon={<Car size={20} />}>
          <Screenshot name="auta" caption="Driver, passengers and free seats in each car." />
          <p>
            A car usually carries a note on when and from where it leaves. Unfolding it reveals the
            passenger list and free seats. If a travel cost is listed with the car, it is
            informational only: the money is handled as a regular expense in Finances.
          </p>
        </Section>

        <Section title="Participants" icon={<Users size={20} />}>
          <Screenshot name="ucastnici" caption="Who is coming and for how many nights." />
          <p>
            An overview of the people along with the length of their stay. Whoever stays the whole
            time has it written out; the others have their specific nights listed. The tab appears
            once more than two people are coming.
          </p>
        </Section>

        <NextPage href="/napoveda/finance" />
      </div>
    </HelpShell>
  )
}
