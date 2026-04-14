import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM_ADDRESS = Deno.env.get('RESEND_FROM_ADDRESS')!;
const ADMIN_NOTIFICATION_EMAIL = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')!;

const APP_URL = Deno.env.get('APP_URL') ?? 'https://ladysmithtrailstewards.ca';

Deno.serve(async (req) => {
  const payload = await req.json();
  const record = payload?.record;

  if (record?.role !== 'pending') {
    return new Response('ok', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } =
    await supabase.auth.admin.getUserById(record.auth_user_id);

  if (userError) {
    console.error('Failed to look up user:', userError.message);
    return new Response(userError.message, { status: 500 });
  }

  const email = userData?.user?.email ?? null;

  if (!email) {
    console.warn(
      'No email found for user',
      record.auth_user_id,
      '— skipping notification'
    );
    return new Response('ok', { status: 200 });
  }

  const rawName = record.name ?? 'Unknown';
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const name = escape(rawName);
  const safeEmail = escape(email);
  const signedUpAt = escape(
    record.policy_accepted_at ?? record.created_at ?? 'Not available'
  );
  const usersPageUrl = `${APP_URL}/users`;

  const html = `
    <p>A new user has signed up and is pending approval.</p>
    <ul>
      <li><strong>Name:</strong> ${name}</li>
      <li><strong>Email:</strong> ${safeEmail}</li>
      <li><strong>Signed up:</strong> ${signedUpAt}</li>
    </ul>
    <p><a href="${usersPageUrl}">Review pending users</a></p>
  `;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_ADDRESS,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `New user pending approval — ${rawName}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const body = await resendRes.text();
    console.error('Resend error:', resendRes.status, body);
    return new Response(`Resend error: ${body}`, { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
