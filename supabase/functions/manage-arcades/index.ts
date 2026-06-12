import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// CORS headers allow your frontend website to securely talk to this function without being blocked
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
  // Handle the initial browser security handshake
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 THE CLOUD VAULT
    // The serverless function pulls your private keys safely from Supabase's cloud environment.
    // They are completely hidden here and never leak down to the user's browser.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ROUTE A: Fetch all arcades when the frontend requests them via GET
    if (req.method === 'GET') {
      const { data, error } = await supabaseClient.from('arcades').select('*')
      if (error) throw error
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // ROUTE B: Insert a new arcade pin when the admin submits a POST request
    if (req.method === 'POST') {
      const body = await req.json()
      const { action, payload } = body

      if (action === 'insert') {
        const { error } = await supabaseClient.from('arcades').insert([payload])
        if (error) throw error
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
    }

    return new Response("Method not allowed", { status: 405 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})