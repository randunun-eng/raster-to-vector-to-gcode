/**
 * Void-Satellite AI Worker
 * Handles image processing and edge detection for CNC plotter vectorization
 */

export default {
    async fetch(request, env, ctx) {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // Health check
            if (url.pathname === '/health') {
                return Response.json({ status: 'ok', service: 'void-satellite-ai' }, { headers: corsHeaders });
            }

            // AI Edge Detection endpoint
            if (url.pathname === '/api/trace' && request.method === 'POST') {
                return await handleTraceRequest(request, env, corsHeaders);
            }

            // AI-assisted contour extraction
            if (url.pathname === '/api/analyze' && request.method === 'POST') {
                return await handleAnalyzeRequest(request, env, corsHeaders);
            }

            return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('Worker error:', error);
            return Response.json(
                { error: 'Internal server error', message: error.message },
                { status: 500, headers: corsHeaders }
            );
        }
    }
};

/**
 * Handle image tracing request - extracts edges and converts to vector paths
 * Uses AI vision to identify clean lines for RC plane foam templates
 */
async function handleTraceRequest(request, env, corsHeaders) {
    const formData = await request.formData();
    const imageFile = formData.get('image');
    const options = JSON.parse(formData.get('options') || '{}');

    if (!imageFile) {
        return Response.json({ error: 'No image provided' }, { status: 400, headers: corsHeaders });
    }

    const imageBytes = await imageFile.arrayBuffer();
    const imageArray = [...new Uint8Array(imageBytes)];

    // Use Cloudflare AI for image analysis
    // LLaVA model for understanding the image content
    const analysisPrompt = `Analyze this image for CNC cutting/plotting. 
    Identify the main outline shapes and cutting lines.
    For RC plane foam templates, focus on:
    - Main wing/fuselage outlines
    - Cut lines and fold lines
    - Registration marks
    Describe the key contours that should be traced for cutting.`;

    const analysisResult = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        image: imageArray,
        prompt: analysisPrompt,
        max_tokens: 512
    });

    // Use image-to-image for edge detection style transfer
    // This creates a clean line drawing from the input
    const edgeResult = await env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', {
        prompt: 'clean black line drawing, technical blueprint, vector outline, white background, no shading, only outlines',
        image: imageArray,
        strength: 0.7,
        num_steps: 4
    });

    // Return both analysis and processed edge image
    return Response.json({
        success: true,
        analysis: analysisResult.description || analysisResult,
        edgeImage: edgeResult.image ? `data:image/png;base64,${arrayBufferToBase64(edgeResult.image)}` : null,
        options: {
            threshold: options.threshold || 128,
            simplify: options.simplify || 2,
            smoothing: options.smoothing || 1
        }
    }, { headers: corsHeaders });
}

/**
 * Analyze image to extract path descriptions for manual tracing guidance
 */
async function handleAnalyzeRequest(request, env, corsHeaders) {
    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile) {
        return Response.json({ error: 'No image provided' }, { status: 400, headers: corsHeaders });
    }

    const imageBytes = await imageFile.arrayBuffer();
    const imageArray = [...new Uint8Array(imageBytes)];

    // Detailed analysis for RC plane templates
    const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
        image: imageArray,
        prompt: `You are analyzing an RC hobby plane foam cutting template image.
    
    Describe in detail:
    1. What type of RC plane component is this (wing, fuselage, tail, etc.)?
    2. List the main outline paths that need to be cut
    3. Identify any internal cut lines or slots
    4. Note any text labels or measurements visible
    5. Describe the overall dimensions if visible
    
    Be specific about shapes: straight lines, curves, circles, etc.`,
        max_tokens: 1024
    });

    return Response.json({
        success: true,
        analysis: result.description || result,
        tips: [
            'Use the pen tool to trace main outlines first',
            'Add internal cuts as separate paths',
            'Check grid alignment for accurate dimensions'
        ]
    }, { headers: corsHeaders });
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
