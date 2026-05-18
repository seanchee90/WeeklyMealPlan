import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://yxukbsdxtgywwzsvjqgd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4dWtic2R4dGd5d3d6c3ZqcWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODk4ODEsImV4cCI6MjA5NDY2NTg4MX0.69SrClqVQ_GkQcTuwYZkkor63KxlCXSLCXcsuE2z54o'
)
