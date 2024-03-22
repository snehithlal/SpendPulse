# frozen_string_literal: true

module ApplicationHelper
  def form_error_notification(object)
    return unless object.errors.any?

    tag.div class: "bg-red-200 text-white p-3" do
      object.errors.full_messages.to_sentence.capitalize
    end
  end
end
