// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI), idiomatic English.

import { KeyRound, LogOut, Mail, ShieldQuestion, Sparkles, UserCheck } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function UcetContentEn() {
  return (
    <HelpShell
      title="Account and signing in"
      lead="An account is just an email and a link that arrives in your inbox. There is no password to make up."
    >
      <div className="flex flex-col gap-6">
        <Section title="What an account gets you" icon={<UserCheck size={20} />}>
          <p>The whole chata can be browsed without signing in. An account adds three things:</p>
          <List
            items={[
              <>
                Finances opens straight on your name; you do not have to find yourself in the
                list.
              </>,
              <>You can add your own expenses, and edit and delete the ones you added.</>,
              <>
                Your numbers disappear from the list for anonymous visitors. Your name stays there,
                just greyed out.
              </>,
            ]}
          />
          <p>
            One account can hold several names, even within one chata. Typically a parent who also
            carries their children and switches between them.
          </p>
        </Section>

        <Section title="Signing in with an email link" icon={<Mail size={20} />}>
          <p className="text-sm text-gray-500">
            The screenshots in this guide show the interface in Czech; the layout is the same in
            English.
          </p>
          <Screenshot
            name="prihlaseni"
            caption="The sign-in dialog. The link is valid for 15 minutes and works only once."
          />
          <Steps
            items={[
              <>
                Open <strong>Sign in</strong> in the page footer.
              </>,
              <>
                Enter your email and tap &quot;Send sign-in link&quot;. The response is always the
                same: the app never reveals to anyone whether an account exists for that address.
              </>,
              <>
                Find the message in your inbox and tap the link. That gets you in, back to where
                you left off.
              </>,
            ]}
          />
          <p>
            If you have a Microsoft, Google or Apple account, you can use the{' '}
            <strong>Sign in with Microsoft</strong>, <strong>Google</strong> or{' '}
            <strong>Apple</strong> button instead. The result is the same, as long as the
            account uses the same email address.
          </p>
          <Callout tone="warn">
            No email arrived? Check your spam folder, and make sure you are typing the same
            address the chata admin has next to your name. An account nobody has created gets no
            link.
          </Callout>
        </Section>

        <Section title="Linking: &quot;Is that you?&quot;" icon={<ShieldQuestion size={20} />}>
          <p>
            When you open your own name in Finances and it has no account yet, this bar appears
            under the header.
          </p>
          <Screenshot name="jsi-to-ty" caption="The linking offer for the selected participant." />
          <Steps
            items={[
              <>
                Tap <strong>This is me</strong>. A dialog with two paths opens.
              </>,
              <>
                <strong>I already have an account</strong>: sign in with Microsoft, Google or
                Apple, or have a link sent to you. When you come back, the request submits itself.
              </>,
              <>
                <strong>I&apos;m new here</strong>: leave your email and a verification link
                arrives. Clicking it verifies your address and signs you in for the first time in
                one go.
              </>,
              <>
                The chata admin gets an email and decides. Once they approve, you get a message
                and the participant is yours.
              </>,
            ]}
          />
          <List
            items={[
              <>
                If the app already knows you from another chata, the link happens right away.
                Nobody has to approve anything.
              </>,
              <>
                While a request is waiting, a bar with the information and a{' '}
                <strong>Withdraw</strong> button holds its place.
              </>,
              <>
                Several people can ask for the same name at once. Approving one automatically
                rejects the other requests.
              </>,
              <>A rejection always comes with a reason, written by the admin.</>,
            ]}
          />
          <Callout>
            Only a name that belongs to nobody yet can be linked. For people who have already
            signed in, the offer does not appear. Extra names on your account (a partner, children)
            are added for you by the chata admin.
          </Callout>
        </Section>

        <Section title="What changes after signing in" icon={<Sparkles size={20} />}>
          <List
            items={[
              <>The home page shows only the chatas you take part in, each with your balance.</>,
              <>Finances skips the name picker.</>,
              <>A button for adding expenses appears.</>,
              <>The footer shows your email and a sign-out link instead of the sign-in one.</>,
            ]}
          />
        </Section>

        <Section title="Signing out and how long it lasts" icon={<LogOut size={20} />}>
          <List
            items={[
              <>A regular account stays signed in for 30 days, chata admins for two hours.</>,
              <>It works across all chatas, including those with their own address.</>,
              <>
                You can sign out at any time with the <strong>Sign out</strong> link in the footer.
              </>,
            ]}
          />
          <p>
            The superadmin signs in exclusively through Microsoft, Google or Apple. If they
            request a link by
            email, an explanation arrives instead.
          </p>
        </Section>

        <Section title="Where accounts come from" icon={<KeyRound size={20} />}>
          <List
            items={[
              <>Either you ask for a link yourself via &quot;Is that you?&quot;.</>,
              <>
                Or the chata admin creates the account from your email address. Nothing is sent to
                you at that moment. The first message arrives once you ask to sign in.
              </>,
            ]}
          />
        </Section>

        <NextPage href="/napoveda/prehled" />
      </div>
    </HelpShell>
  )
}
