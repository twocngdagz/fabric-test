<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreTemplateRequest;
use App\Http\Requests\Api\UpdateTemplateRequest;
use App\Models\Template;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Minimal index; could paginate if needed
        $templates = Template::query()
            ->orderByDesc('id')
            ->get(['id','name','canvas_width','canvas_height']);

        return response()->json(['data' => $templates]);
    }

    public function store(StoreTemplateRequest $request): JsonResponse
    {
        $template = Template::create($request->validated());
        return response()->json(['data' => $template], 201);
    }

    public function show(Template $template): JsonResponse
    {
        return response()->json(['data' => $template]);
    }

    public function update(UpdateTemplateRequest $request, Template $template): JsonResponse
    {
        $template->update($request->validated());
        return response()->json(['data' => $template]);
    }

    public function destroy(Template $template): JsonResponse
    {
        $template->delete();
        return response()->json([], 204);
    }
}

