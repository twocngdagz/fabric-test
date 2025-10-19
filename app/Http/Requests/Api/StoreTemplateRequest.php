<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class StoreTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Accept minimal template JSON { version, canvas:{width,height}, frames:[...] }
        // and normalize into canonical fields used by the Template model.
        $hasMinimal = $this->has(['canvas.width', 'canvas.height']) && $this->has('frames');
        if ($hasMinimal) {
            $width = (int) $this->input('canvas.width');
            $height = (int) $this->input('canvas.height');
            $frames = $this->input('frames');

            $name = $this->string('name')->toString();
            if ($name === '') {
                $name = 'Template '.now()->format('Y-m-d H:i:s');
            }

            $this->merge([
                'name' => $name,
                'canvas_width' => $width,
                'canvas_height' => $height,
                // Persist only the frames as elements payload (background is intentionally skipped)
                'elements' => is_array($frames) ? $frames : [],
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'canvas_width' => ['required', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['required', 'integer', 'min:1', 'max:8192'],
            'elements' => ['required', 'array'],
        ];
    }
}
