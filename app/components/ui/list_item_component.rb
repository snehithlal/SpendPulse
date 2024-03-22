# frozen_string_literal: true

class Ui::ListItemComponent < ViewComponent::Base
  attr_reader :name, :path, :active, :icon_classes

  def initialize(name:, path:, active:, icon_classes: [])
    @name = name
    @path = path
    @active = active
    @icon_classes = icon_classes
  end

  def icon
    "<i class='#{icon_classes.join(' ')}'></i>".html_safe
  end

  def list_classes
    active ? "bg-gray-800 text-white" : "hover:bg-gray-400 hover:text-white"
  end
end
