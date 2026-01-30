import { NextRequest, NextResponse } from 'next/server';
import { getAgroRecommendation, getMockRecommendation, RegionData } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const regionData: RegionData = await request.json();

    // Validate required fields
    if (!regionData.region_name || regionData.NDVI === undefined) {
      return NextResponse.json(
        { error: 'Missing required data: region_name and NDVI are required' },
        { status: 400 }
      );
    }

    // Set defaults for optional fields
    const enrichedData: RegionData = {
      country: 'Uzbekistan',
      crop: 'cotton',
      year: new Date().getFullYear(),
      risk_category: 'Moderate',
      NDVI_anomaly: 0,
      NDVI_slope: 0,
      precipitation_total_mm: 300,
      precipitation_anomaly_mm: 0,
      temperature_mean_C: 25,
      drought_proxy: 0,
      heat_stress_days_proxy: 0,
      elevation: 400,
      slope: 2,
      ...regionData,
    };

    // Check if API key is available
    const hasApiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    let recommendation;
    
    if (hasApiKey) {
      try {
        recommendation = await getAgroRecommendation(enrichedData);
      } catch (apiError) {
        console.error('Gemini API error, falling back to mock:', apiError);
        recommendation = getMockRecommendation(enrichedData);
      }
    } else {
      // Use mock response for demo/development
      console.log('No GEMINI_API_KEY found, using mock response');
      recommendation = getMockRecommendation(enrichedData);
    }

    return NextResponse.json(recommendation);

  } catch (error) {
    console.error('Recommendation API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendation' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'AI Recommendation API - Use POST method with region data' },
    { status: 200 }
  );
}
